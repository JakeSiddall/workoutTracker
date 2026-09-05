# ChatGPT integration feasibility

Status at handoff: not verified end to end. Local prototype work can proceed.

## What is known

- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) documents outbound private connectivity for MCP. It is the preferred candidate to evaluate, not a confirmed account entitlement or working Pi installation.
- [ChatGPT connector testing](https://developers.openai.com/plugins/deploy/connect-chatgpt) is the reference for actual discovery/invocation checks.
- No local tunnel-client command was found during discovery. Pi architecture/client support has not been tested.
- The Mac was locked during attempted account inspection. The user cannot unlock it until later. Do not attempt to bypass the lock or inspect stored credentials.
- Access to custom lifting tools alongside Apple Health/Kaiser in the intended health conversation has NOT been tested. Transport success alone does not establish this.

## Test sequence

1. Prepare a disposable read-only MCP service with `list_sessions`, `get_session`, and `get_exercise_history` over fixtures/integration-sample.json. Keep synthetic records separate from real history.
2. When the user can interact with the account, verify available developer/tunnel permissions, workspace association, and supported client deployment. Use supported credential entry; keep secrets outside source control and tool output. Verify current official docs before configuring the connection.
3. In the intended ChatGPT interface, confirm tool discovery and ask: “Show both sample bench sessions, including targets, actuals, and warm-ups. How did the work-set load change?” Expected actual work: 100 lb × 5, then 105 lb × 5. Load increased 5 lb at the same logged reps; this sparse evidence does not prove a 5% gain in strength. The 45 lb warm-up is not work volume.
4. Ask: “How many pull-ups did I log in the later sample session, and how many sets?” Expected: 12 total bodyweight reps; set count is unknown, not inferred.
5. Separately check whether these tools and the user's existing health sources are actually available in the same intended conversation. Record observed behavior and any limitations without copying medical contents into project files or Linear.
6. Test date filters, pagination, missing values, units/load basis, and rejection of unauthorized or mutation requests. A read-only annotation is not enforcement.

Record test date, interface/account context without sensitive identifiers, tool result accuracy, transport outcome, and same-conversation outcome. Leave unperformed steps marked NOT RUN. If health-context coexistence fails, present the limitation and agree on a fallback before declaring the holistic requirement satisfied. Public HTTPS/OAuth is a possible later proposal, not automatic authorization to expose a service.

Final integration against real persisted sessions belongs to JAK-9 after the workflow is agreed. Do not seed real history from this fixture.
