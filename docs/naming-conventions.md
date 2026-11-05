# Naming conventions for SAP objects

The rules an application built on this template needs for its RAP back end, copied from SAP Development's naming
conventions (SAP-Project-Development V1). Every RAP object an application creates is listed in its worklog Object list.

## The pattern

- Every custom object begins with **ZFS**. Pattern: `ZFS_<TYPE>_<AREA>_<NAME>`.
- `<AREA>` is a 2–4 character module code: SD, MM, FI, PP, EWM, HR, TRM, DYN, ALM, XA (cross-app). Maximum lengths
  per SAP object type apply.
- A prefix a person supplies, such as "`ZFS_ALM*`", names the **area**; the type marker still comes first:
  `ZFS_T_ALM_LIMIT`, not `ZFS_ALM_LIMIT`.
- A derived name never inherits non-conformance: a copy or successor of an object is checked against these tables
  on its own, whatever the source is called.
- **Check before create.** Immediately before an object is created, check its name against the tables below and
  write one line in the worklog: `NAMING: <name> → matches <row>`. On a mismatch, stop and ask; do not create it.
- Never `$TMP`: every object goes into a `ZFS_*` package with a transport.

## Dictionary (DDIC)

| Object | Pattern | Example |
|---|---|---|
| Transparent table | `ZFS_T_<AREA>_<NAME>`, **max 16 characters** (platform-enforced) | `ZFS_T_SD_ORDLOG` |
| Structure | `ZFS_S_<AREA>_<NAME>` (30) | `ZFS_S_SD_ORDER_ITEM` |
| Table type | `ZFS_TT_<AREA>_<NAME>` | `ZFS_TT_SD_ORDER_ITEM` |
| Data element | `ZFS_DE_<NAME>` | `ZFS_DE_APPROVAL_STATUS` |
| Domain | `ZFS_DO_<NAME>` | `ZFS_DO_APPROVAL_STATUS` |
| Lock object | `EZFS_T_<NAME>` | `EZFS_T_SD_ORDLOG` |
| Search help | `ZFS_SH_<NAME>` | `ZFS_SH_CARRIER` |
| Number range | `ZFS_NR_<NAME>` | `ZFS_NR_TICKETID` |

## CDS and RAP

`<Entity>` is one CamelCase business-object name, used verbatim across the stack. For a transactional business
object the `TP` suffix is part of `<Entity>` and appears once, only on the layers that carry behaviour:

| Layer | Carries `TP`? | Example (`<Entity>` = `SalesOrderTP`) |
|---|---|---|
| Interface view `ZFS_I_` | no | `ZFS_I_SalesOrder` |
| Root view `ZFS_R_`, projection `ZFS_C_`, metadata extension, both behaviour definitions | yes | `ZFS_R_SalesOrderTP`, `ZFS_C_SalesOrderTP` |
| Behaviour pool `ZBP_FS_` | yes (upper case) | `ZBP_FS_SALESORDERTP` |
| Service definition `ZFS_SD_`, service binding `ZFS_SB_` | no | `ZFS_SD_SALESORDER`, `ZFS_SB_SALESORDER_O4_API` |
| Local classes `LHC_` / `LSC_` / `LTC_` | no | `LHC_SALESORDER` |

Never append `TP` to a pattern that already ends in `<Entity>` (that gives `ZFS_C_SalesOrderTPTP`). A read-only or
analytical view takes no `TP`.

| Object | Pattern | Example |
|---|---|---|
| Interface view | `ZFS_I_<Entity>` | `ZFS_I_SalesOrder` |
| Projection view | `ZFS_C_<Entity>` | `ZFS_C_SalesOrderTP` |
| Business-object root view | `ZFS_R_<Entity>` | `ZFS_R_SalesOrderTP` |
| Custom entity | `ZFS_CE_<Entity>` | `ZFS_CE_PriceSimulation` |
| Abstract entity | `ZFS_AE_<Entity>` | `ZFS_AE_ActionParams` |
| Behaviour definition | same as the root view | `ZFS_R_SalesOrderTP` |
| Behaviour pool | `ZBP_FS_<Entity>` | `ZBP_FS_SALESORDERTP` |
| Metadata extension | same as its view | `ZFS_C_SalesOrderTP` |
| Access control | same name as the view it protects | `ZFS_R_SalesOrderTP` |
| Service definition | `ZFS_SD_<Entity>` | `ZFS_SD_SALESORDER` |
| Service binding | `ZFS_SB_<Entity>_<O2/O4>_<UI/API>` | `ZFS_SB_SALESORDER_O4_API` |

The root view is `ZFS_R_<Entity>`, **never** `ZFS_I_<Entity>` and never a bare `Z`, `ZI_` or `ZC_` prefix. CDS field
and alias names are CamelCase (`TravelId`, `CreatedAt`); RAP's own signature names keep their spelling (`keys`,
`entities`, `result`, `mapped`, `failed`, `reported`). One handler class per entity (`LHC_<Entity>`), one saver per
business object (`LSC_<Entity>`).

**This template's services** are OData V4 Web API bindings, `ZFS_SB_<Entity>_O4_API`, called through `srvd_a2x`
URLs with `sap-client` on every call.

## Classes and other objects

| Object | Pattern | Example |
|---|---|---|
| Class | `ZCL_FS_<AREA>_<NAME>` | `ZCL_FS_SD_ORDER_PROCESSOR` |
| Interface | `ZIF_FS_<AREA>_<NAME>` | `ZIF_FS_SD_ORDER_API` |
| Exception class | `ZCX_FS_<NAME>` | `ZCX_FS_ORDER_NOT_FOUND` |
| RAP query provider | `ZCL_FS_<AREA>_<NAME>_QUERY` | `ZCL_FS_SD_PRICESIM_QUERY` |
| Package | `ZFS_<AREA>` under `ZFS_ROOT`; application packages `ZFS_<AREA>_<APP>` | `ZFS_ALM_API` |
| Message class | `ZFS_TRM_MSG` only: the single project-wide class; never create another | `ZFS_TRM_MSG` |
| Authorization object | `ZFS_<NAME>`, 10 characters max | — |
