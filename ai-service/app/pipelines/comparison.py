"""Transparent rule extraction; comparisons are review cues, never fraud findings."""
import re
from datetime import datetime

def fields(text):
    output = {}
    patterns = {"registration": r"(?im)^(?:vehicle registration|registration)\s*:\s*([^\n]+)", "policy": r"(?im)^policy (?:number|reference)\s*:\s*([^\n]+)", "date": r"(?im)^(?:accident date|incident date|date)\s*:\s*([^\n]+)", "claimant": r"(?im)^(?:claimant|policyholder)\s*:\s*([^\n]+)", "location": r"(?im)^location\s*:\s*([^\n]+)"}
    for key, pattern in patterns.items():
        values = re.findall(pattern, text)
        if values:
            normalized = []
            for value in values:
                value = value.strip()
                if key == "date":
                    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d/%m/%Y"):
                        try: value = datetime.strptime(value, fmt).date().isoformat(); break
                        except ValueError: pass
                    else:
                        normalized.append(None); continue
                normalized.append(re.sub(r"[\W_]", "", value).casefold())
            output[key] = normalized[0] if len(set(normalized)) == 1 else None
    return output

def aggregate(request, results):
    sources = [("claim-description", fields(request.description))] + [(r.id, fields(r.extractedText)) for r in results]
    comparisons = []
    for key in ("registration", "policy", "date", "claimant", "location"):
        values = [{"source": source, "value": data[key]} for source, data in sources if key in data]
        state = "MISSING" if not values else "UNVERIFIABLE" if any(v["value"] is None for v in values) else "UNVERIFIABLE" if len(values) < 2 else "MATCH" if len({v["value"] for v in values}) == 1 else "MISMATCH"
        comparisons.append({"field": key, "status": state, "sources": values, "method": "labelled-field rules", "requiresReview": True})
    financial = []
    for result in results:
        for line in result.extractedText.splitlines():
            amounts = re.findall(r"(?i)\b(R|ZAR|USD)\s*([\d,]+(?:\.\d{1,2})?)", line)
            for currency, amount in amounts:
                category = next((label for word, label in (("excess", "excess"), ("tax", "tax"), ("vat", "tax"), ("total", "document_total")) if word in line.lower()), "unclassified")
                if category == "document_total":
                    category = "invoice_total" if result.evidenceType == "repair_invoice" else "quoted_repair_cost" if result.evidenceType == "repair_estimate" else category
                financial.append({"source": result.id, "context": line[:300], "category": category, "currency": "ZAR" if currency.upper() == "R" else currency.upper(), "amount": float(amount.replace(",", "")), "requiresReview": True})
    estimates = [v for v in financial if v['category'] == 'quoted_repair_cost']
    invoices = [v for v in financial if v['category'] == 'invoice_total']
    total_status = 'MISSING' if not estimates or not invoices else 'UNVERIFIABLE'
    if len(estimates) == len(invoices) == 1 and estimates[0]['currency'] == invoices[0]['currency']:
        total_status = 'MATCH' if estimates[0]['amount'] == invoices[0]['amount'] else 'MISMATCH'
    comparisons.append({'field':'estimate_invoice_total','status':total_status,'sources':estimates + invoices,'method':'labelled document totals; no summing','requiresReview':True})
    checklist = []
    for kind in request.requiredEvidence:
        matches = [r for r in results if r.evidenceType == kind or kind == "repair_estimate" and r.evidenceType == "repair_invoice"]
        checklist.append({"type": kind, "status": "Needs verification" if matches else "Missing", "sources": [r.id for r in matches]})
    return {"comparisons": comparisons, "financialObservations": financial, "checklist": checklist}
