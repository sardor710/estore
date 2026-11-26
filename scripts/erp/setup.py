"""
One-time, idempotent ERPNext setup for company Zanko (zanko.uz integration).

Run inside the erp-backend container from the sites directory:
  docker cp scripts/erp/setup.py erp-backend:/home/frappe/frappe-bench/sites/zk_setup.py
  docker exec erp-backend bash -c 'cd sites && ../env/bin/python zk_setup.py <command>; rm zk_setup.py'

Commands:
  baseline <out>   print Garmin counts as JSON (A8)
  setup            currency, company, price list, groups, customer, custom fields
  apiuser [--new-secret]  create/update zanko-sync user + roles; prints key and, when (re)generated, the secret
  webhooks <url> <secret> [enabled]   create/update the two Zanko webhooks
"""
import json
import sys

import frappe

SITE = "erp.tigr.uz"
COMPANY = "Zanko"
WAREHOUSE = "Stores - Z"
PRICE_LIST = "Zanko Retail"
CUSTOMER = "zanko.uz Website"
ROOT_GROUP = "Zanko"
API_USER = "zanko-sync@zanko.uz"


def baseline():
    items = frappe.get_all("Item Default", filters={"company": "Garmin"}, pluck="parent")
    out = {
        "garmin_items": frappe.db.count("Item Default", {"company": "Garmin"}),
        "all_items_not_zanko": frappe.db.sql(
            "select count(*) from tabItem i where not exists (select 1 from `tabItem Default` d where d.parent=i.name and d.company='Zanko')"
        )[0][0],
        "garmin_bin_qty": float(
            frappe.db.sql("select coalesce(sum(b.actual_qty),0) from tabBin b join tabWarehouse w on w.name=b.warehouse where w.company='Garmin'")[0][0]
        ),
        "garmin_sle": frappe.db.count("Stock Ledger Entry", {"company": "Garmin"}),
        "item_price_non_zanko": frappe.db.count("Item Price", {"price_list": ["!=", PRICE_LIST]}),
        "garmin_si": frappe.db.count("Sales Invoice", {"company": "Garmin"}),
    }
    print(json.dumps(out, sort_keys=True))


def ensure(doctype, name, values):
    if frappe.db.exists(doctype, name):
        doc = frappe.get_doc(doctype, name)
        changed = False
        for k, v in values.items():
            if doc.get(k) != v:
                doc.set(k, v)
                changed = True
        if changed:
            doc.save(ignore_permissions=True)
        return doc
    doc = frappe.get_doc({"doctype": doctype, **values})
    doc.insert(ignore_permissions=True)
    return doc


def custom_field(dt, fieldname, label, insert_after, **extra):
    name = f"{dt}-{fieldname}"
    if frappe.db.exists("Custom Field", name):
        return
    frappe.get_doc(
        {"doctype": "Custom Field", "dt": dt, "fieldname": fieldname, "label": label, "fieldtype": "Data", "insert_after": insert_after, **extra}
    ).insert(ignore_permissions=True)


def setup():
    # 1. Currency UZS
    frappe.db.set_value("Currency", "UZS", {"enabled": 1, "symbol": "so'm", "smallest_currency_fraction_value": 0, "number_format": "#,###"})

    # 2. Company Zanko → UZS, no perpetual inventory (no accounting in scope; nothing is posted yet)
    if frappe.db.count("GL Entry", {"company": COMPANY}):
        raise SystemExit("Zanko already has GL entries; refusing to change currency")
    frappe.db.sql("update tabAccount set account_currency='UZS' where company=%s and account_currency='USD'", COMPANY)
    frappe.db.set_value(
        "Company",
        COMPANY,
        {"default_currency": "UZS", "enable_perpetual_inventory": 0, "default_warehouse_for_sales_return": WAREHOUSE},
    )

    # 3. Masters
    ensure("Price List", PRICE_LIST, {"price_list_name": PRICE_LIST, "currency": "UZS", "selling": 1, "buying": 0, "enabled": 1})
    ensure("Item Group", ROOT_GROUP, {"item_group_name": ROOT_GROUP, "parent_item_group": "Все группы продуктов", "is_group": 1})
    ensure("Territory", "Uzbekistan", {"territory_name": "Uzbekistan", "parent_territory": "Все Территории", "is_group": 0})
    ensure(
        "Customer",
        CUSTOMER,
        {
            "customer_name": CUSTOMER,
            "customer_type": "Individual",
            "customer_group": "Частное лицо",
            "territory": "Uzbekistan",
            "default_currency": "UZS",
            "default_price_list": PRICE_LIST,
        },
    )

    # 4. Custom fields
    custom_field("Delivery Note", "zanko_order_ref", "zanko.uz order ref", "customer", unique=1, read_only=1, in_list_view=1, in_standard_filter=1, no_copy=1)
    custom_field("Stock Entry", "zanko_order_ref", "zanko.uz order ref", "stock_entry_type", unique=1, read_only=1, in_standard_filter=1, no_copy=1)
    custom_field("Item", "zanko_url", "zanko.uz page", "item_group", read_only=1)

    frappe.db.commit()
    print(json.dumps({
        "currency": frappe.db.get_value("Company", COMPANY, "default_currency"),
        "perpetual": frappe.db.get_value("Company", COMPANY, "enable_perpetual_inventory"),
        "usd_accounts": frappe.db.count("Account", {"company": COMPANY, "account_currency": "USD"}),
        "uom": frappe.get_all("Item", fields=["stock_uom"], group_by="stock_uom", pluck="stock_uom"),
    }, ensure_ascii=False))


def apiuser():
    if not frappe.db.exists("User", API_USER):
        u = frappe.get_doc({"doctype": "User", "email": API_USER, "first_name": "zanko.uz sync", "user_type": "System User", "send_welcome_email": 0, "enabled": 1})
        u.insert(ignore_permissions=True)
    u = frappe.get_doc("User", API_USER)
    have = {r.role for r in u.roles}
    for role in ["Stock User", "Stock Manager", "Sales User", "Item Manager", "Sales Master Manager"]:
        if role not in have:
            u.append("roles", {"role": role})
    if not u.api_key:
        u.api_key = frappe.generate_hash(length=15)
    secret = None
    if "--new-secret" in sys.argv or not u.get_password("api_secret", raise_exception=False):
        secret = frappe.generate_hash(length=15)
        u.api_secret = secret
    u.save(ignore_permissions=True)
    # Restrict the user to company Zanko.
    if not frappe.db.exists("User Permission", {"user": API_USER, "allow": "Company", "for_value": COMPANY}):
        frappe.get_doc({"doctype": "User Permission", "user": API_USER, "allow": "Company", "for_value": COMPANY, "apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
    frappe.db.commit()
    print(json.dumps({"key": u.api_key, "secret": secret}))


def webhooks(url, secret, enabled="0"):
    common = {"request_url": url, "request_method": "POST", "request_structure": "JSON", "enable_security": 1, "webhook_secret": secret, "enabled": int(enabled)}
    # Proven in the 2026-11-26 spike: Stock Ledger Entry fires after_insert (Bin is written with
    # db.set_value and fires nothing); Item Price on_update also fires on insert.
    specs = [
        ("ZK stock", "Stock Ledger Entry", "after_insert", 'doc.company == "Zanko"', '{"type":"stock","item_code":"{{ doc.item_code }}"}'),
        ("ZK price", "Item Price", "on_update", 'doc.price_list == "Zanko Retail"', '{"type":"price","item_code":"{{ doc.item_code }}"}'),
        ("ZK price delete", "Item Price", "on_trash", 'doc.price_list == "Zanko Retail"', '{"type":"price","item_code":"{{ doc.item_code }}"}'),
    ]
    for title, dt, event, cond, body in specs:
        name = frappe.db.get_value("Webhook", {"webhook_doctype": dt, "webhook_docevent": event, "request_url": url})
        doc = frappe.get_doc("Webhook", name) if name else frappe.new_doc("Webhook")
        if not name:
            doc.name = title
        doc.update({"webhook_doctype": dt, "webhook_docevent": event, "condition": cond, "webhook_json": body, **common})
        doc.set("webhook_headers", [{"key": "Content-Type", "value": "application/json"}])
        doc.save(ignore_permissions=True)
        print(title, doc.name, "enabled" if doc.enabled else "disabled")
    frappe.db.commit()


if __name__ == "__main__":
    frappe.init(site=SITE)
    frappe.connect()
    frappe.set_user("Administrator")
    cmd = sys.argv[1]
    if cmd == "baseline":
        baseline()
    elif cmd == "setup":
        setup()
    elif cmd == "apiuser":
        apiuser()
    elif cmd == "webhooks":
        webhooks(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "0")
    else:
        raise SystemExit(__doc__)
