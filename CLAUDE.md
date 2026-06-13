# footy-preds

## Task workflow

All tasks requested by the user must follow this process:

1. **Convert to task descriptions first.** Before writing any code, rewrite the request into structured task descriptions. Each description must include:
   - What the feature or fix does
   - Which files need to change
   - Any validation criteria for the user to manually verify

2. **Split into backend and frontend tasks.** Tasks must be bifurcated so there is no file overlap between the two. If a task cannot be cleanly split (shared files), create a single fullstack task instead.

3. **Wait for user confirmation** before proceeding.

4. **Pass confirmed tasks to agents.** Backend tasks go to a backend agent; frontend tasks go to a frontend agent. Do not implement directly in the main conversation after the workflow is established.
