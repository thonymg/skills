## Application service (use-case coordinator)

### Use when

- A single use-case coordinates multiple ports (repo + clock + logger + external API).
- The behavior is still empty, but wiring must be explicit.

### Rules

- One use-case = one responsibility.
- Inputs/outputs are explicit types (often `*Input`, `Result<*, *>`).
- No IO directly; delegate to ports.

