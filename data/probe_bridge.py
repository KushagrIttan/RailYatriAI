import json, urllib.request

# 1. Hit .NET bridge endpoint
req = urllib.request.Request("http://localhost:5053/api/optimization/generate", data=b"{}", headers={"Content-Type":"application/json"}, method="POST")
resp = urllib.request.urlopen(req, timeout=30)
body = resp.read().decode()
print("=== .NET /api/optimization/generate ===")
print("Status:", resp.status)
print(body[:800])

# 2. Hit Python directly
req2 = urllib.request.Request("http://localhost:8000/optimize", data=json.dumps({"tasks":[],"block_requests":[]}).encode(), headers={"Content-Type":"application/json"}, method="POST")
resp2 = urllib.request.urlopen(req2, timeout=30)
body2 = resp2.read().decode()
print("\n=== Python /optimize (empty payload) ===")
print("Status:", resp2.status)
print(body2[:800])