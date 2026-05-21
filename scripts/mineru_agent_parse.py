#!/usr/bin/env python3
"""Call MinerU Agent PDF parse API and print the returned task/result payloads."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests


API_BASE = "https://mineru.net/api/v1/agent/parse"


def print_json(title: str, payload: Any) -> None:
    print(f"{title}=")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload a PDF to MinerU Agent API and inspect the returned parse result."
    )
    parser.add_argument("pdf_path", help="Path to the PDF file to parse.")
    parser.add_argument(
        "--language",
        default="en",
        help="Document language hint passed to MinerU. Default: en",
    )
    parser.add_argument(
        "--page-range",
        default="",
        help="Optional page range string accepted by MinerU, for example 1-5.",
    )
    parser.add_argument(
        "--output-markdown",
        help="Optional path to save the returned Markdown result.",
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
        default=180.0,
        help="Maximum seconds to wait for parsing to finish. Default: 180",
    )
    parser.add_argument(
        "--disable-table",
        action="store_true",
        help="Disable table parsing.",
    )
    parser.add_argument(
        "--ocr",
        action="store_true",
        help="Enable OCR mode.",
    )
    parser.add_argument(
        "--disable-formula",
        action="store_true",
        help="Disable formula parsing.",
    )
    return parser.parse_args()


def ensure_success(response: requests.Response, stage: str) -> dict[str, Any]:
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise RuntimeError(f"{stage} failed: {json.dumps(payload, ensure_ascii=False)}")
    return payload


def create_task(
    session: requests.Session,
    pdf_path: Path,
    language: str,
    page_range: str,
    enable_table: bool,
    is_ocr: bool,
    enable_formula: bool,
) -> dict[str, Any]:
    payload = {
        "file_name": pdf_path.name,
        "language": language,
        "page_range": page_range,
        "enable_table": enable_table,
        "is_ocr": is_ocr,
        "enable_formula": enable_formula,
    }
    print_json("CREATE_PAYLOAD", payload)
    response = session.post(f"{API_BASE}/file", json=payload, timeout=30)
    print(f"CREATE_STATUS={response.status_code}")
    response_payload = ensure_success(response, "create_task")
    print_json("CREATE_JSON", response_payload)
    return response_payload


def upload_file(session: requests.Session, upload_url: str, pdf_path: Path) -> None:
    with pdf_path.open("rb") as handle:
        response = session.put(upload_url, data=handle, timeout=120)
    print(f"UPLOAD_STATUS={response.status_code}")
    response.raise_for_status()
    body = response.text.strip()
    if body:
        print("UPLOAD_TEXT=")
        print(body[:2000])


def poll_task(
    session: requests.Session,
    task_id: str,
    poll_interval: float,
    max_wait_seconds: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + max_wait_seconds
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        response = session.get(f"{API_BASE}/{task_id}", timeout=30)
        print(f"POLL_{attempt}_STATUS={response.status_code}")
        payload = ensure_success(response, f"poll_task[{attempt}]")
        print_json(f"POLL_{attempt}_JSON", payload)
        data = payload.get("data", {})
        state = str(data.get("state") or data.get("status") or "").lower()
        if state in {"done", "success", "finished", "complete", "completed"}:
            return payload
        if any(flag in state for flag in ("fail", "error", "reject", "cancel")):
            raise RuntimeError(f"task ended in unexpected state: {state}")
        time.sleep(poll_interval)
    raise TimeoutError(f"task did not finish within {max_wait_seconds} seconds")


def download_markdown(
    session: requests.Session,
    markdown_url: str,
    output_path: Path | None,
) -> str:
    response = session.get(markdown_url, timeout=60)
    print(f"MARKDOWN_STATUS={response.status_code}")
    response.raise_for_status()
    text = response.text
    print("MARKDOWN_HEAD=")
    print(text[:4000])
    if output_path is not None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text, encoding="utf-8")
        print(f"MARKDOWN_SAVED={output_path}")
    return text


def main() -> int:
    args = parse_args()
    pdf_path = Path(args.pdf_path).expanduser().resolve()
    if not pdf_path.is_file():
        print(f"PDF file not found: {pdf_path}", file=sys.stderr)
        return 1

    session = requests.Session()
    create_payload = create_task(
        session=session,
        pdf_path=pdf_path,
        language=args.language,
        page_range=args.page_range,
        enable_table=not args.disable_table,
        is_ocr=args.ocr,
        enable_formula=not args.disable_formula,
    )

    data = create_payload.get("data", {})
    task_id = data.get("task_id")
    upload_url = data.get("file_url")
    if not task_id or not upload_url:
        raise RuntimeError(f"Missing task_id or file_url: {json.dumps(data, ensure_ascii=False)}")

    print(f"TASK_ID={task_id}")
    print(f"UPLOAD_TARGET={upload_url}")
    upload_file(session, upload_url, pdf_path)

    result_payload = poll_task(
        session=session,
        task_id=task_id,
        poll_interval=args.poll_interval,
        max_wait_seconds=args.max_wait_seconds,
    )
    result_data = result_payload.get("data", {})
    markdown_url = result_data.get("markdown_url")
    if markdown_url:
        print(f"MARKDOWN_URL={markdown_url}")
        output_path = Path(args.output_markdown).expanduser().resolve() if args.output_markdown else None
        download_markdown(session, markdown_url, output_path)
    else:
        print("MARKDOWN_URL=")
        print("No markdown_url found in final result payload.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - script entrypoint
        print(f"ERROR={exc}", file=sys.stderr)
        raise
