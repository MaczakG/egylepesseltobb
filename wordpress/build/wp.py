"""Small helpers for the WordPress REST API and the Elementor MCP endpoint.

Credentials come from the environment: WP_URL (site root) and WP_AUTH
("user:application password"). Nothing secret is stored in this repository.
"""
import base64, json, os, ssl, time, urllib.request, urllib.error

WP_URL = os.environ.get("WP_URL", "https://bographic.hu/fejlesztes_2").rstrip("/")
_AUTH = "Basic " + base64.b64encode(os.environ["WP_AUTH"].encode()).decode()
_CA = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
_CTX = ssl.create_default_context(cafile=_CA) if _CA else ssl.create_default_context()


PAUSE = float(os.environ.get("WP_PAUSE", "2.5"))  # be gentle: the host runs Imunify360 bot protection


def rest(method, path, data=None, raw=None, headers=None, timeout=120, _try=0):
    time.sleep(PAUSE)
    url = WP_URL + "/wp-json/" + path.lstrip("/")
    h = {"Authorization": _AUTH, "Accept": "application/json"}
    body = None
    if raw is not None:
        body = raw
    elif data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, context=_CTX, timeout=timeout) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:800]
        if e.code == 403 and "Imunify360" in msg and _try < 4:
            time.sleep(30 * (2 ** _try))
            return rest(method, path, data, raw, headers, timeout, _try + 1)
        raise RuntimeError(f"{method} {path} -> {e.code}: {msg}")


_SID = None


def mcp(tool, args):
    """Call an Elementor MCP tool; returns the decoded structured result."""
    global _SID
    url = WP_URL + "/wp-json/elementor/mcp/"

    def post(payload):
        h = {"Authorization": _AUTH, "Content-Type": "application/json", "Accept": "application/json, text/event-stream",
             "MCP-Protocol-Version": "2025-06-18"}
        if _SID:
            h["Mcp-Session-Id"] = _SID
        req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=h, method="POST")
        try:
            with urllib.request.urlopen(req, context=_CTX, timeout=300) as r:
                return r.headers.get("mcp-session-id"), r.read().decode()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"MCP HTTP {e.code}: {e.read().decode()[:1500]}")

    if not _SID:
        _SID, _ = post({"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "elt-build", "version": "1"}}})
        post({"jsonrpc": "2.0", "method": "notifications/initialized"})
    _, out = post({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}})
    res = json.loads(out)
    if "error" in res:
        raise RuntimeError(f"MCP {tool}: {res['error']}")
    r = res["result"]
    if r.get("isError"):
        raise RuntimeError(f"MCP {tool}: {r['content'][0]['text'][:1500]}")
    return r.get("structuredContent") or json.loads(r["content"][0]["text"])


def save_elementor(post_type_route, post_id, elements, page_settings=None, extra=None):
    """Write Elementor (V3) data through REST, then let Elementor re-save the document
    (regenerates CSS and clears its caches) via the MCP update-page-settings ability."""
    payload = {"meta": {"_elementor_edit_mode": "builder", "_elementor_data": json.dumps(elements, ensure_ascii=False)}}
    if page_settings is not None:
        payload["meta"]["_elementor_page_settings"] = page_settings
    if extra:
        payload.update(extra)
    rest("POST", f"wp/v2/{post_type_route}/{post_id}", payload)
    mcp("elementor-update-page-settings", {"post_id": post_id, "settings": page_settings or {"hide_title": "yes"}})
