#!/usr/bin/env python3
"""Import Avito list CSV and detail-parser JSON files into a local SQLite database.

The database is local runtime data; do not commit the generated .sqlite file.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    title TEXT,
    url TEXT,
    location TEXT,
    address TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_price_rub INTEGER,
    last_views_count INTEGER,
    last_source TEXT
);

CREATE TABLE IF NOT EXISTS sellers (
    seller_key TEXT PRIMARY KEY,
    name TEXT,
    rating REAL,
    reviews_count INTEGER,
    account_since TEXT,
    seller_type TEXT,
    active_ads_count INTEGER,
    profile_url TEXT,
    response_time TEXT,
    visible_info TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_details (
    listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
    description TEXT,
    parameters_json TEXT NOT NULL DEFAULT '[]',
    attributes_json TEXT NOT NULL DEFAULT '{}',
    parameters_raw TEXT,
    pickup_only INTEGER,
    delivery_text_json TEXT NOT NULL DEFAULT '[]',
    images_json TEXT NOT NULL DEFAULT '[]',
    published_label TEXT,
    seller_key TEXT REFERENCES sellers(seller_key),
    raw_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
    snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    observed_at TEXT NOT NULL,
    source TEXT NOT NULL CHECK(source IN ('list', 'detail')),
    price_rub INTEGER,
    views_count INTEGER,
    title TEXT,
    location TEXT,
    address TEXT,
    seller_rating REAL,
    seller_reviews_count INTEGER,
    UNIQUE(listing_id, observed_at, source)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_listing_time
    ON snapshots(listing_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_listings_last_seen
    ON listings(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_sellers_profile
    ON sellers(profile_url);

CREATE TABLE IF NOT EXISTS collection_runs (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    source TEXT NOT NULL,
    source_file TEXT NOT NULL,
    rows_count INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    errors_json TEXT NOT NULL DEFAULT '[]'
);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def parse_price(value: Any) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    return int(digits) if digits else None


def parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def json_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def seller_key(seller: dict[str, Any], listing_id: str) -> str | None:
    urls = seller.get("profile_urls") or []
    # Without a profile URL, do not merge unrelated sellers with the same display name.
    identity = clean(urls[0]) if urls else f"listing:{listing_id}"
    return hashlib.sha256(identity.lower().encode("utf-8")).hexdigest()[:24]


def connect(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    return conn


def begin_run(conn: sqlite3.Connection, source: str, source_file: str) -> int:
    cur = conn.execute(
        "INSERT INTO collection_runs(started_at, source, source_file) VALUES (?, ?, ?)",
        (now_iso(), source, str(source_file)),
    )
    return int(cur.lastrowid)


def finish_run(
    conn: sqlite3.Connection, run_id: int, rows: int, imported: int, errors: list[str]
) -> None:
    conn.execute(
        """UPDATE collection_runs
           SET rows_count=?, imported_count=?, errors_json=? WHERE run_id=?""",
        (rows, imported, json_text(errors), run_id),
    )


def upsert_listing(
    conn: sqlite3.Connection,
    listing_id: str,
    title: str | None,
    url: str | None,
    location: str | None,
    address: str | None,
    price: int | None,
    views: int | None,
    observed_at: str,
    source: str,
) -> None:
    conn.execute(
        """INSERT INTO listings
           (id,title,url,location,address,first_seen_at,last_seen_at,last_price_rub,
            last_views_count,last_source)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             title=COALESCE(excluded.title,listings.title),
             url=COALESCE(excluded.url,listings.url),
             location=COALESCE(excluded.location,listings.location),
             address=COALESCE(excluded.address,listings.address),
             last_seen_at=excluded.last_seen_at,
             last_price_rub=COALESCE(excluded.last_price_rub,listings.last_price_rub),
             last_views_count=COALESCE(excluded.last_views_count,listings.last_views_count),
             last_source=excluded.last_source""",
        (listing_id, title, url, location, address, observed_at, observed_at, price, views, source),
    )
    conn.execute(
        """INSERT OR IGNORE INTO snapshots
           (listing_id,observed_at,source,price_rub,views_count,title,location,address)
           VALUES (?,?,?,?,?,?,?,?)""",
        (listing_id, observed_at, source, price, views, title, location, address),
    )


def import_list_csv(conn: sqlite3.Connection, file_path: Path) -> tuple[int, int, list[str]]:
    errors: list[str] = []
    imported = 0
    with file_path.open("r", encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        except csv.Error:
            dialect = csv.excel
            dialect.delimiter = ";"
        reader = csv.DictReader(f, dialect=dialect)
        rows = list(reader)

    run_id = begin_run(conn, "list", str(file_path))
    with conn:
        for line_no, row in enumerate(rows, start=2):
            try:
                listing_id = clean(row.get("id"))
                if not listing_id:
                    raise ValueError("missing id")
                observed_at = now_iso()
                price = parse_price(row.get("price"))
                upsert_listing(
                    conn, listing_id, clean(row.get("title")), clean(row.get("url")),
                    None, clean(row.get("address")), price, None, observed_at, "list"
                )
                imported += 1
            except Exception as exc:
                errors.append(f"line {line_no}: {exc}")
        finish_run(conn, run_id, len(rows), imported, errors)
    return len(rows), imported, errors


def import_detail_json(conn: sqlite3.Connection, file_path: Path) -> tuple[int, int, list[str]]:
    errors: list[str] = []
    data = json.loads(file_path.read_text(encoding="utf-8"))
    rows = data if isinstance(data, list) else [data]
    run_id = begin_run(conn, "detail", str(file_path))
    imported = 0

    with conn:
        for item in rows:
            try:
                listing_id = clean(item.get("id"))
                if not listing_id:
                    raise ValueError("missing id")
                observed_at = clean(item.get("captured_at")) or now_iso()
                stats = item.get("listing_stats") or {}
                seller = item.get("seller") or {}
                price = parse_price(item.get("price"))
                views = parse_int(stats.get("views_count"))
                location = clean(item.get("location"))
                title = clean(item.get("title"))
                upsert_listing(
                    conn, listing_id, title, clean(item.get("url")), location, None,
                    price, views, observed_at, "detail"
                )

                key = seller_key(seller, listing_id)
                if key:
                    profile_urls = seller.get("profile_urls") or []
                    conn.execute(
                        """INSERT INTO sellers
                           (seller_key,name,rating,reviews_count,account_since,seller_type,
                            active_ads_count,profile_url,response_time,visible_info,updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(seller_key) DO UPDATE SET
                             name=COALESCE(excluded.name,sellers.name),
                             rating=COALESCE(excluded.rating,sellers.rating),
                             reviews_count=COALESCE(excluded.reviews_count,sellers.reviews_count),
                             account_since=COALESCE(excluded.account_since,sellers.account_since),
                             seller_type=COALESCE(excluded.seller_type,sellers.seller_type),
                             active_ads_count=COALESCE(excluded.active_ads_count,sellers.active_ads_count),
                             profile_url=COALESCE(excluded.profile_url,sellers.profile_url),
                             response_time=COALESCE(excluded.response_time,sellers.response_time),
                             visible_info=COALESCE(excluded.visible_info,sellers.visible_info),
                             updated_at=excluded.updated_at""",
                        (
                            key, clean(seller.get("name")),
                            float(seller["rating"]) if clean(seller.get("rating")) else None,
                            parse_int(seller.get("reviews_count")),
                            clean(seller.get("account_since")), clean(seller.get("type")),
                            parse_int(seller.get("active_ads_count")),
                            clean(profile_urls[0]) if profile_urls else None,
                            clean(seller.get("response_time")), clean(seller.get("visible_info")),
                            observed_at,
                        ),
                    )

                delivery = item.get("delivery_and_pickup") or {}
                conn.execute(
                    """INSERT INTO listing_details
                       (listing_id,description,parameters_json,attributes_json,parameters_raw,
                        pickup_only,delivery_text_json,images_json,published_label,seller_key,
                        raw_json,updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(listing_id) DO UPDATE SET
                         description=excluded.description,
                         parameters_json=excluded.parameters_json,
                         attributes_json=excluded.attributes_json,
                         parameters_raw=excluded.parameters_raw,
                         pickup_only=excluded.pickup_only,
                         delivery_text_json=excluded.delivery_text_json,
                         images_json=excluded.images_json,
                         published_label=excluded.published_label,
                         seller_key=excluded.seller_key,
                         raw_json=excluded.raw_json,
                         updated_at=excluded.updated_at""",
                    (
                        listing_id, clean(item.get("description")),
                        json_text(item.get("parameters") or []),
                        json_text(item.get("attributes") or {}),
                        clean(item.get("parameters_raw")),
                        (1 if delivery.get("pickup_only") is True else
                         0 if delivery.get("pickup_only") is False else None),
                        json_text(delivery.get("visible_text") or []),
                        json_text(item.get("images") or []),
                        clean(stats.get("published_label")), key,
                        json_text(item), observed_at,
                    ),
                )
                conn.execute(
                    """UPDATE snapshots SET seller_rating=?, seller_reviews_count=?
                       WHERE listing_id=? AND observed_at=? AND source='detail'""",
                    (
                        float(seller["rating"]) if clean(seller.get("rating")) else None,
                        parse_int(seller.get("reviews_count")), listing_id, observed_at,
                    ),
                )
                imported += 1
            except Exception as exc:
                errors.append(f"id {item.get('id', '?')}: {exc}")
        finish_run(conn, run_id, len(rows), imported, errors)
    return len(rows), imported, errors


def show_stats(conn: sqlite3.Connection) -> None:
    for label, query in [
        ("Объявления", "SELECT COUNT(*) FROM listings"),
        ("Подробные карточки", "SELECT COUNT(*) FROM listing_details"),
        ("Продавцы", "SELECT COUNT(*) FROM sellers"),
        ("Наблюдения", "SELECT COUNT(*) FROM snapshots"),
        ("Запуски импорта", "SELECT COUNT(*) FROM collection_runs"),
    ]:
        print(f"{label}: {conn.execute(query).fetchone()[0]}")

    print("\nПоследние объявления:")
    for row in conn.execute(
        """SELECT id,title,last_price_rub,location,last_seen_at
           FROM listings ORDER BY last_seen_at DESC LIMIT 10"""
    ):
        print(f"{row['id']} | {row['last_price_rub']} ₽ | {row['location']} | {row['title']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Avito SQLite importer")
    parser.add_argument("--db", default="data/avito.sqlite", help="SQLite database path")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create database schema")
    list_cmd = sub.add_parser("import-list", help="Import avito_parser CSV")
    list_cmd.add_argument("file")
    detail_cmd = sub.add_parser("import-detail", help="Import avito_detail_parser JSON")
    detail_cmd.add_argument("file")
    sub.add_parser("stats", help="Show database counters and latest listings")
    args = parser.parse_args()

    conn = connect(args.db)
    try:
        if args.command == "init":
            print(f"База инициализирована: {args.db}")
        elif args.command == "import-list":
            rows, imported, errors = import_list_csv(conn, Path(args.file))
            print(f"CSV: строк {rows}, импортировано {imported}, ошибок {len(errors)}")
            for error in errors:
                print("ERROR:", error)
        elif args.command == "import-detail":
            rows, imported, errors = import_detail_json(conn, Path(args.file))
            print(f"JSON: объектов {rows}, импортировано {imported}, ошибок {len(errors)}")
            for error in errors:
                print("ERROR:", error)
        elif args.command == "stats":
            show_stats(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
