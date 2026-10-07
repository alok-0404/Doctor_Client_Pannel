---
name: Monorepo validation
description: Environment quirks when restoring nested frontend dependencies and simulating production tenant-host requests.
---

The package-install callback installs at the repository root, not the nested frontend directory.

**Why:** Restoring a missing frontend package through that callback installed its React peers at the root, separate from the frontend's React. A successful bundle does not prove the two React instances are safe at runtime.

**How to apply:** Check actual module resolution when restoring dependencies in this nested project; ensure shared UI dependencies use a single frontend React instance.

Use node:http with an explicit Host header for production-domain tenant regression checks.

**Why:** Native fetch-based probes did not exercise the expected tenant-host lookup in this environment, while node:http requests did. A passing response without confirming the resolver was reached can give a false result.

**How to apply:** Assert tenant lookup counts in mocked tests, not only response status, and do not connect these tests to real patient data.
