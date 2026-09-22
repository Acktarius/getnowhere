# Tasks — adopt wallet Envelope 3

## 1. SDK adapter and service boundary

- [x] 1.1 Expose bounded wallet-envelope parsing and Envelope 3 types in the adapter
- [x] 1.2 Replace direct encrypted-file `JSON.parse` with the SDK helper
- [x] 1.3 Separate backup decrypt password from new local wallet password

## 2. Creation and obsolete restore path

- [x] 2.1 Require the confirmed password before `createWallet`
- [x] 2.2 Remove temporary-password generation and session password rewrite
- [x] 2.3 Remove unused restore service/store types and implementation

## 3. Import UI

- [x] 3.1 Add new local password + confirmation to encrypted-file import
- [x] 3.2 Validate backup password and local password independently
- [x] 3.3 Preserve user-safe error handling and secret redaction

## 4. Tests and documentation

- [x] 4.1 Cover bounded parser usage and Envelope 1/2/3 file imports
- [x] 4.2 Cover direct Envelope 3 create/export and absence of temp passwords
- [x] 4.3 Update wallet/security documentation and the review finding
- [x] 4.4 Run scoped tests, types, lint, and format
