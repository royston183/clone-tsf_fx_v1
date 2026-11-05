# Reference FX screens

These screens are imported from `D:\SAP Tool\TSF - FX Application`, following the user's
2026-11-04 request: "port all as-is from reference, show me at the end".
`port-manifest.json` lists the 39 catalogue entries, their feature folders and the seven
menu entries for which the reference has no React screen. Existing custom live pages
remain registered in `src/pages/registry.ts`.

| Reference import | Local replacement |
| --- | --- |
| `@slc/api-client` | `@/ref/api-client` |
| `@slc/api-client/react` | `@/ref/api-client/react` |
| `@slc/ui` | `@/ref/ui` |
| `react-router-dom` | `@/ref/router` |
| reference `auth/*` | `ref/auth/*`, using the workspace login |
| `xlsx` | `@/ref/xlsx`, using the template's workbook reader/writer |

The service addresses `/api/<key>/...` are virtual addresses. The API client routes
SAP calls through the local relay with the tab's SAP account, client 100 and CSRF/ETag
handling. Middleware and local table calls go to `/api/ref/` on the separate backend.
The static frontend serves no data API and has no Vite proxy. Metadata probes use
`refFetch`, which follows the same routing. Notification requests return
`{ queued: false, stub: true }`; they do not send email.

Register an imported default component with `refPage(Feature, { office: true|false })`.
This supplies the reference's styling wrapper, toast provider, searchable controls and
popup guard while retaining the template shell, captcha login and theme. CSS from the
reference feature folders is already scoped to its individual screen root.

`xlsx.readAsync` is asynchronous. The compatibility layer reads XLSX/XLSM and CSV/TSV;
binary XLS input is unsupported. Exports produce XLSX. SAP APIs absent from the
reference remain unavailable; porting the screen does not implement those APIs.

The one-time importer is `scripts/port-reference.mjs`. It refuses to overwrite an
already imported feature and records dependencies in the manifest. Follow-up fixes
belong in the imported files, not in another copy of the reference application.
