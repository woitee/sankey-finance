"""
Air Bank (CZ) PDF statement parser.
Extracts transactions from PDF bank statements and outputs JSON.

Usage:
    python scripts/parse_statement.py <pdf_path> [--output <json_path>]
    python scripts/parse_statement.py data/pdf/ --output-dir data/parsed/
"""

import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber


def parse_czech_amount(text: str) -> float:
    """Convert Czech-formatted amount like '-1 234,56' to float -1234.56"""
    if not text or not text.strip():
        return 0.0
    cleaned = text.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    return float(cleaned)


def parse_czech_date(text: str) -> str:
    """Convert 'dd.mm.yyyy' to ISO date 'yyyy-mm-dd'"""
    match = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})", text.strip())
    if not match:
        return ""
    day, month, year = match.groups()
    return f"{year}-{int(month):02d}-{int(day):02d}"


def classify_transaction_type(czech_type: str) -> str:
    """Map Czech transaction type labels to English enum values."""
    t = czech_type.lower().strip()
    if "platba kartou" in t:
        return "platba_kartou"
    if "p\u0159\xedchoz\xed \xfahrada" in t or "prichozi uhrada" in t:
        return "prichozi_uhrada"
    if "odchoz\xed \xfahrada" in t or "odchozi uhrada" in t:
        return "odchozi_uhrada"
    if "trval\xfd p\u0159\xedkaz" in t or "trvaly prikaz" in t:
        return "trvaly_prikaz"
    if "vr\xe1cen\xed pen\u011bz" in t or "vraceni penez" in t:
        return "vraceni_penez"
    if "odm\u011bna" in t or "odmena" in t:
        return "odmena_unity"
    return "other"


def extract_merchant_name(details: str) -> str:
    """Extract the merchant name from the details field (before the address)."""
    if not details:
        return ""
    # The merchant name is typically everything before the first address-like pattern
    # Try to split on common address patterns
    # Pattern: word followed by number/number or just a street number
    parts = re.split(r"\s+(?=\d+[/,]|\d+\s*,)", details, maxsplit=1)
    merchant = parts[0].strip().rstrip(",")
    # Clean up: remove trailing address fragments
    merchant = re.sub(r"\s+(ul\.|ulice|Nam\.|nám\.).*$", "", merchant, flags=re.IGNORECASE)
    return merchant


def extract_header(pages) -> dict:
    """Extract header metadata from the first page."""
    text = pages[0].extract_text() or ""
    header = {
        "accountNumber": "",
        "period": "",
        "openingBalance": 0.0,
        "closingBalance": 0.0,
        "totalIncome": 0.0,
        "totalDebits": 0.0,
    }

    # Account number
    m = re.search(r"[Čč]\xedslo \xfa[čc]tu:\s*([\d\s]+/\s*\d+)", text)
    if not m:
        m = re.search(r"slo.*tu:\s*([\d\s]+/\s*\d+)", text)
    if m:
        header["accountNumber"] = m.group(1).replace(" ", "")

    # Period: "1. 1. 2026 - 31. 1. 2026" -> "2026-01"
    m = re.search(r"(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s*-\s*\d{1,2}\.\s*\d{1,2}\.\s*\d{4}", text)
    if m:
        year = m.group(3)
        month = int(m.group(2))
        header["period"] = f"{year}-{month:02d}"

    # Balances and totals - handle Czech number format with spaces
    def find_amount(pattern: str) -> float:
        m = re.search(pattern, text)
        if m:
            return parse_czech_amount(m.group(1))
        return 0.0

    header["openingBalance"] = find_amount(r"[Pp]o[čc]\xe1te[čc]n\xed\s+z[ůu]statek:\s*([\d\s,]+)")
    if header["openingBalance"] == 0.0:
        header["openingBalance"] = find_amount(r"statek:\s*([\d\s,]+)")

    header["closingBalance"] = find_amount(r"[Kk]one[čc]n\xfd\s+z[ůu]statek:\s*([\d\s,]+)")
    if header["closingBalance"] == 0.0:
        header["closingBalance"] = find_amount(r"z.statek:\s*([\d\s,]+)")

    header["totalIncome"] = find_amount(r"[Pp]\u0159ips\xe1no\s+na\s+\xfa[čc]et:\s*([\d\s,]+)")
    if header["totalIncome"] == 0.0:
        header["totalIncome"] = find_amount(r"na.*et:\s*([\d\s,]+)")

    header["totalDebits"] = find_amount(r"[Oo]deps\xe1no\s+z\s+\xfa[čc]tu:\s*([\d\s,]+)")
    if header["totalDebits"] == 0.0:
        header["totalDebits"] = find_amount(r"z.*tu:\s*([\d\s,]+)")

    return header


def extract_transactions(pages) -> list[dict]:
    """Extract all transaction rows from all pages."""
    transactions = []
    row_index = 0

    for page in pages:
        tables = page.extract_tables()
        for table in tables:
            if not table or len(table) < 2:
                continue

            # Check if this is a transaction table by looking at headers
            header_row = table[0]
            if not header_row or not any(
                h and ("Za" in h or "tov" in h) for h in header_row if h
            ):
                continue

            # Skip the two header rows
            data_rows = table[2:] if len(table) > 2 else []

            for row in data_rows:
                if not row or len(row) < 5:
                    continue

                # Column 0: dates (zauctovani\nprovedeni)
                dates_raw = (row[0] or "").strip()
                # Column 1: type\ntransaction_code
                type_raw = (row[1] or "").strip()
                # Column 2: name\naccount_or_card
                name_raw = (row[2] or "").strip()
                # Column 3: details (merchant + address)
                details_raw = (row[3] or "").strip()
                # Column 4: amount
                amount_raw = (row[4] or "").strip()
                # Column 5: fees
                fees_raw = (row[5] or "0,00").strip() if len(row) > 5 else "0,00"

                # Parse dates
                date_parts = dates_raw.split("\n")
                date_posted = parse_czech_date(date_parts[0]) if len(date_parts) > 0 else ""
                date_executed = parse_czech_date(date_parts[1]) if len(date_parts) > 1 else date_posted

                if not date_posted:
                    continue  # Skip invalid rows

                # Parse type
                type_parts = type_raw.split("\n")
                tx_type = classify_transaction_type(type_parts[0]) if type_parts else "other"

                # Parse name and account identifier
                # Column 2 format: "Name\nAccount_or_Card"
                # - Card payments: "Cardholder Name\n****1234"  → source is cardholder
                # - Outgoing transfers: "Recipient Name\nRecipient IBAN" → source is account owner (implicit)
                # - Incoming transfers: "Sender Name\nSender IBAN" or just "Sender IBAN" → show sender
                name_parts = name_raw.split("\n")
                line1 = name_parts[0].strip() if name_parts else ""
                line2 = name_parts[1].strip() if len(name_parts) > 1 else ""

                OUTGOING_TYPES = ("platba_kartou", "odchozi_uhrada", "trvaly_prikaz")
                INCOMING_TYPES = ("prichozi_uhrada", "vraceni_penez", "odmena_unity")

                def looks_like_account(s: str) -> bool:
                    # IBAN (CZ...) or local account number (digits/digits)
                    return bool(re.match(r'^[A-Z]{2}\d', s) or re.match(r'^\d+/\d+$', s))

                if tx_type in OUTGOING_TYPES:
                    if tx_type == "platba_kartou":
                        # line1 = cardholder (source), line2 = masked card
                        cardholder_name = line1
                        account_identifier = line2
                    else:
                        # line1 = recipient name (or IBAN), line2 = recipient IBAN
                        # Source is the account owner — not in this row, leave blank
                        cardholder_name = ""
                        account_identifier = line2 if line2 else line1
                elif tx_type in INCOMING_TYPES:
                    # line1 = sender name (or IBAN if no name), line2 = sender IBAN
                    if looks_like_account(line1):
                        # No name — use account number as display fallback
                        cardholder_name = line1
                        account_identifier = line1
                    else:
                        cardholder_name = line1
                        account_identifier = line2
                else:
                    cardholder_name = line1
                    account_identifier = line2

                # Parse details - clean up newlines
                details = details_raw.replace("\n", " ").strip()
                merchant_name = extract_merchant_name(details)

                # Parse amount
                amount = parse_czech_amount(amount_raw)
                fees = parse_czech_amount(fees_raw)

                row_index += 1
                transactions.append({
                    "id": f"tx-{row_index:03d}",
                    "datePosted": date_posted,
                    "dateExecuted": date_executed,
                    "type": tx_type,
                    "cardholderName": cardholder_name,
                    "accountIdentifier": account_identifier,
                    "merchantName": merchant_name,
                    "details": details,
                    "amount": amount,
                    "fees": fees,
                    "cat3": None,
                    "cat2": None,
                    "cat1": None,
                    "categorizationSource": None,
                })

    return transactions


def parse_statement(pdf_path: str) -> dict:
    """Parse a single Air Bank PDF statement into a structured dict."""
    with pdfplumber.open(pdf_path) as pdf:
        header = extract_header(pdf.pages)
        transactions = extract_transactions(pdf.pages)

    # Update transaction IDs with period prefix
    period = header.get("period", "unknown")
    for i, tx in enumerate(transactions):
        tx["id"] = f"{period}-{i + 1:03d}"

    return {
        "period": period,
        "accountNumber": header["accountNumber"],
        "openingBalance": header["openingBalance"],
        "closingBalance": header["closingBalance"],
        "totalIncome": header["totalIncome"],
        "totalDebits": header["totalDebits"],
        "transactions": transactions,
    }


def main():
    parser = argparse.ArgumentParser(description="Parse Air Bank PDF statements to JSON")
    parser.add_argument("input", help="PDF file path or directory containing PDFs")
    parser.add_argument("--output", "-o", help="Output JSON file path")
    parser.add_argument("--output-dir", "-d", help="Output directory for batch mode")
    parser.add_argument("--debug", action="store_true", help="Print raw table data for debugging")
    args = parser.parse_args()

    input_path = Path(args.input)

    if input_path.is_file():
        # Single file mode
        print(f"Parsing: {input_path}")
        result = parse_statement(str(input_path))

        if args.debug:
            with pdfplumber.open(str(input_path)) as pdf:
                for i, page in enumerate(pdf.pages):
                    print(f"\n=== Page {i + 1} raw tables ===")
                    for table in page.extract_tables():
                        for row in table:
                            print(row)

        output_path = args.output or f"data/parsed/{result['period']}.json"
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        tx_count = len(result["transactions"])
        income = sum(t["amount"] for t in result["transactions"] if t["amount"] > 0)
        expense = sum(t["amount"] for t in result["transactions"] if t["amount"] < 0)
        print(f"Period: {result['period']}")
        print(f"Transactions: {tx_count}")
        print(f"Income: {income:,.2f} CZK")
        print(f"Expenses: {expense:,.2f} CZK")
        print(f"Output: {output_path}")

    elif input_path.is_dir():
        # Batch mode
        output_dir = Path(args.output_dir or "data/parsed")
        output_dir.mkdir(parents=True, exist_ok=True)

        pdfs = sorted(input_path.glob("*.pdf"))
        if not pdfs:
            print(f"No PDF files found in {input_path}")
            sys.exit(1)

        for pdf_file in pdfs:
            print(f"Parsing: {pdf_file}")
            result = parse_statement(str(pdf_file))
            output_path = output_dir / f"{result['period']}.json"

            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)

            print(f"  -> {output_path} ({len(result['transactions'])} transactions)")

    else:
        print(f"Error: {input_path} not found")
        sys.exit(1)


if __name__ == "__main__":
    main()
