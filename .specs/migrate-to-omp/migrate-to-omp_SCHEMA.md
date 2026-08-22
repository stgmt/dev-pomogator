# OMP Migration Schema

## Root marketplace catalog

| Field | Type | Required | Contract |
|---|---|---|---|
| name | string | yes | Marketplace identity stgmt. |
| plugins | array | yes | Contains dev-pomogator with source ./ . |
| plugins[].name | string | yes | dev-pomogator. |
| plugins[].source | string | yes | Relative root source ./ . |

## OMP extension mapping row

| Field | Type | Required | Contract |
|---|---|---|---|
| legacy_source | string | yes | Existing hook/guard identifier. |
| omp_event | string | yes | Documented OMP event. |
| result_shape | string | yes | Declared block/input/content/details response shape. |
| ordering | string | yes | Registration and conflict behavior. |
| headless_policy | string | yes | Deterministic non-UI behavior. |
| owner | string | yes | Migration task identifier. |
| scenario | string | yes | Matching MIGRATE001 scenario. |

## MCP probe record

| Field | Type | Required | Contract |
|---|---|---|---|
| plugin_root | string | yes | Resolved installed plugin root. |
| command | string | yes | Final stdio executable. |
| args | string array | yes | Final launcher arguments. |
| environment | object | yes | Substituted project and plugin root values. |
| read_result | object | yes | Successful read_spec_doc evidence. |
| refusal_result | object | yes | Invalid mutation findings with no target write. |
