#!/usr/bin/env python3
"""Call MinerU precision extract API for local files and inspect structured output."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

import requests


API_BASE = "https://mineru.net/api/v4"


def print_json(title: str, payload: Any) -> None:
    print(f"{title}=")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def read_token(token_file: Path) -> str:
    token = token_file.read_text(encoding="utf-8-sig").strip().splitlines()[0].strip()
    if not token:
        raise RuntimeError(f"empty token file: {token_file}")
    return token


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload a local file to MinerU precision extract API and inspect the result zip."
    )
    parser.add_argument(
        "file_path",
        nargs="?",
        help="Local PDF/DOCX/PPTX/image file path.",
    )
    parser.add_argument(
        "--source-url",
        help="Remote file URL for MinerU batch URL parsing mode.",
    )
    parser.add_argument(
        "--token-file",
        required=True,
        help="Path to a text file containing the MinerU API token.",
    )
    parser.add_argument(
        "--model-version",
        default="vlm",
        choices=["pipeline", "vlm", "MinerU-HTML"],
        help="MinerU model version. Default: vlm",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Document language hint. Default: en",
    )
    parser.add_argument(
        "--data-id",
        default="",
        help="Optional business data id echoed back by MinerU.",
    )
    parser.add_argument(
        "--enable-table",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable or disable table recognition. Default: enabled.",
    )
    parser.add_argument(
        "--enable-formula",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable or disable formula recognition. Default: enabled.",
    )
    parser.add_argument(
        "--is-ocr",
        action="store_true",
        help="Enable OCR mode.",
    )
    parser.add_argument(
        "--page-range",
        default="",
        help="Optional page range, for example 1-10.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=3.0,
        help="Seconds between polling attempts. Default: 3",
    )
    parser.add_argument(
        "--max-wait-seconds",
        type=float,
        default=300.0,
        help="Maximum seconds to wait for parsing to finish. Default: 300",
    )
    parser.add_argument(
        "--output-dir",
        default="workspace/mineru",
        help="Directory to store downloaded zip and extracted inspection files. Default: workspace/mineru",
    )
    return parser.parse_args()


def ensure_success(response: requests.Response, stage: str) -> dict[str, Any]:
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise RuntimeError(f"{stage} failed: {json.dumps(payload, ensure_ascii=False)}")
    return payload


def create_batch_task(
    session: requests.Session,
    token: str,
    file_path: Path,
    model_version: str,
    language: str,
    data_id: str,
    enable_table: bool,
    enable_formula: bool,
    is_ocr: bool,
    page_range: str,
) -> dict[str, Any]:
    payload = {
        "files": [{"name": file_path.name, "data_id": data_id or file_path.stem}],
        "model_version": model_version,
        "language": language,
        "enable_table": enable_table,
        "enable_formula": enable_formula,
        "is_ocr": is_ocr,
        "page_range": page_range,
    }
    print_json("CREATE_PAYLOAD", payload)
    response = session.post(
        f"{API_BASE}/file-urls/batch",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    print(f"CREATE_STATUS={response.status_code}")
    result = ensure_success(response, "create_batch_task")
    print_json("CREATE_JSON", result)
    return result


def create_batch_task_from_url(
    session: requests.Session,
    token: str,
    source_url: str,
    data_id: str,
    model_version: str,
    language: str,
    enable_table: bool,
    enable_formula: bool,
    is_ocr: bool,
    page_range: str,
) -> dict[str, Any]:
    payload = {
        "files": [{"url": source_url, "is_ocr": is_ocr, "data_id": data_id or "remote-file"}],
        "model_version": model_version,
        "language": language,
        "enable_table": enable_table,
        "enable_formula": enable_formula,
        "page_range": page_range,
    }
    print_json("CREATE_PAYLOAD", payload)
    response = session.post(
        f"{API_BASE}/extract/task/batch",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    print(f"CREATE_STATUS={response.status_code}")
    result = ensure_success(response, "create_batch_task_from_url")
    print_json("CREATE_JSON", result)
    return result


def upload_file(session: requests.Session, upload_url: str, file_path: Path) -> None:
    with file_path.open("rb") as handle:
        response = session.put(upload_url, data=handle, timeout=240)
    print(f"UPLOAD_STATUS={response.status_code}")
    response.raise_for_status()
    body = response.text.strip()
    if body:
        print("UPLOAD_TEXT=")
        print(body[:2000])


def poll_results(
    session: requests.Session,
    token: str,
    batch_id: str,
    poll_interval: float,
    max_wait_seconds: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + max_wait_seconds
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        response = session.get(
            f"{API_BASE}/extract-results/batch/{batch_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=30,
        )
        print(f"POLL_{attempt}_STATUS={response.status_code}")
        payload = ensure_success(response, f"poll_results[{attempt}]")
        print_json(f"POLL_{attempt}_JSON", payload)

        data = payload.get("data", {})
        extract_results = data.get("extract_result", [])
        if not isinstance(extract_results, list):
            raise RuntimeError("unexpected batch result structure")

        states = [str(item.get("state") or "").lower() for item in extract_results if isinstance(item, dict)]
        if states and all(state in {"done", "success", "finished", "complete", "completed"} for state in states):
            return payload
        if any(any(flag in state for flag in ("fail", "error", "reject", "cancel")) for state in states):
            return payload
        time.sleep(poll_interval)
    raise TimeoutError(f"batch did not finish within {max_wait_seconds} seconds")


def download_zip(session: requests.Session, zip_url: str, output_path: Path) -> Path:
    response = session.get(zip_url, timeout=240)
    print(f"ZIP_STATUS={response.status_code}")
    response.raise_for_status()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(response.content)
    print(f"ZIP_SAVED={output_path}")
    return output_path


def inspect_zip(zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        print_json("ZIP_FILES", names)

        interesting_names: list[str] = []
        for name in names:
            lowered = name.lower()
            if lowered == "full.md":
                interesting_names.append(name)
            elif lowered.endswith("_content_list.json") or lowered.endswith("_content_list_v2.json"):
                interesting_names.append(name)
            elif lowered.endswith("_model.json") or lowered == "layout.json" or lowered == "middle.json":
                interesting_names.append(name)

        for candidate in interesting_names:
            with archive.open(candidate) as handle:
                raw = handle.read()
            print(f"{candidate.upper()}_SIZE={len(raw)}")
            if candidate.lower().endswith(".md"):
                text = raw.decode("utf-8", errors="replace")
                print(f"{candidate.upper()}_HEAD=")
                print(text[:4000])
                continue

            try:
                data = json.loads(raw.decode("utf-8"))
            except Exception as exc:  # pragma: no cover - inspection helper
                print(f"{candidate.upper()}_PARSE_ERROR={exc}")
                continue

            if isinstance(data, list):
                print_json(f"{candidate.upper()}_FIRST_ITEMS", data[:3])
            elif isinstance(data, dict):
                print_json(f"{candidate.upper()}_KEYS", sorted(data.keys()))
                print_json(f"{candidate.upper()}_PREVIEW", {k: data[k] for k in list(data)[:5]})
            else:
                print_json(f"{candidate.upper()}_VALUE", data)


def main() -> int:
    args = parse_args()
    token_file = Path(args.token_file).expanduser().resolve()
    if not args.file_path and not args.source_url:
        print("either file_path or --source-url is required", file=sys.stderr)
        return 1
    if not token_file.is_file():
        print(f"token file not found: {token_file}", file=sys.stderr)
        return 1

    file_path: Path | None = None
    if args.file_path:
        file_path = Path(args.file_path).expanduser().resolve()
        if not file_path.is_file():
            print(f"file not found: {file_path}", file=sys.stderr)
            return 1

    token = read_token(token_file)
    session = requests.Session()

    if args.source_url:
        create_result = create_batch_task_from_url(
            session=session,
            token=token,
            source_url=args.source_url,
            data_id=args.data_id,
            model_version=args.model_version,
            language=args.language,
            enable_table=args.enable_table,
            enable_formula=args.enable_formula,
            is_ocr=args.is_ocr,
            page_range=args.page_range,
        )
    else:
        assert file_path is not None
        create_result = create_batch_task(
            session=session,
            token=token,
            file_path=file_path,
            model_version=args.model_version,
            language=args.language,
            data_id=args.data_id,
            enable_table=args.enable_table,
            enable_formula=args.enable_formula,
            is_ocr=args.is_ocr,
            page_range=args.page_range,
        )

    data = create_result.get("data", {})
    batch_id = data.get("batch_id")
    if not batch_id:
        raise RuntimeError(f"missing batch_id: {json.dumps(data, ensure_ascii=False)}")

    print(f"BATCH_ID={batch_id}")
    if args.source_url:
        print(f"SOURCE_URL={args.source_url}")
    else:
        file_urls = data.get("file_urls", [])
        if not isinstance(file_urls, list) or not file_urls or file_path is None:
            raise RuntimeError(f"missing file_urls: {json.dumps(data, ensure_ascii=False)}")
        print_json("UPLOAD_URLS", file_urls)
        upload_file(session, file_urls[0], file_path)

    result_payload = poll_results(
        session=session,
        token=token,
        batch_id=batch_id,
        poll_interval=args.poll_interval,
        max_wait_seconds=args.max_wait_seconds,
    )

    result_data = result_payload.get("data", {})
    extract_results = result_data.get("extract_result", [])
    if not isinstance(extract_results, list) or not extract_results:
        raise RuntimeError("missing extract_result in batch response")

    first_done = next(
        (
            item
            for item in extract_results
            if isinstance(item, dict) and str(item.get("state") or "").lower() in {"done", "success", "finished", "complete", "completed"}
        ),
        None,
    )
    if first_done is None:
        print("No finished result yet.")
        return 0

    zip_url = first_done.get("full_zip_url")
    if not zip_url:
        print("No full_zip_url in finished result.")
        return 0

    output_dir = Path(args.output_dir).expanduser().resolve()
    output_name = file_path.stem if file_path is not None else "remote-file"
    zip_path = output_dir / f"{output_name}.zip"
    download_zip(session, zip_url, zip_path)
    inspect_zip(zip_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
