# Cerulean

Cerulean is a local Vite + React app for working Azure DevOps items in a drag-and-drop board.

## Requirements

- [Bun](https://bun.sh/) installed
- Access to an Azure DevOps organization and project
- An Azure DevOps Personal Access Token (PAT)
- A modern browser with `localStorage` enabled

## Azure DevOps PAT

This app uses an **Azure DevOps PAT** to access Azure DevOps.

### Minimum PAT permissions

Create the PAT with these scopes:

- **Work Items (Read, write, & manage)** — OAuth scope `vso.work_write`
- **Code (Read)** — OAuth scope `vso.code`
- **User profile (Read)** — OAuth scope `vso.profile`

Why those scopes:

- Cerulean queries and updates work items.
- Cerulean reads linked pull requests, statuses, threads, and policy evaluations.
- Cerulean reads your Azure DevOps identity from `/_apis/connectiondata` so it can assign work items to you.

### How to create the PAT

1. Sign in to Azure DevOps.
2. Open **User settings** -> **Personal access tokens**.
3. Select **New Token**.
4. Choose the target organization.
5. Set an expiration.
6. Enable:
   - **Work Items (Read, write, & manage)**
   - **Code (Read)**
   - **User profile (Read)**
7. Copy the token once and store it somewhere safe.

## Install

```bash
bun install
```

## Run locally

Start the dev server:

```bash
bun run dev
```

Then open the local URL Vite prints, usually:

```text
http://localhost:5173
```

## First-time setup

When the app opens, click **Settings** and fill in these sections.

### Connection

- **Personal Access Token**: your Azure DevOps PAT
- **Organization**: your org name, for example `my-org`
- **Project**: your project name, for example `my-project`

Notes:

- Organization input can be just the org name or a full Azure DevOps URL.
- Project input can be the project name or a URL containing the project.
- Use **Test Connection** before saving.

### Source

- **Source State**: work item state to load into the board, default `Active`
- **Approval State**: optional review state, for example `Resolved`
- **Closed State**: optional done state used by demo mode, for example `Closed`
- **Candidate State**: optional unassigned intake state, for example `New`
- **Area Path**: optional ADO area filter, for example `Project\Team`
- **Work Item Types**: optional comma-separated filter, for example `Bug, Task, User Story`
- **Poll Interval (seconds)**: refresh cadence, default `30`

### Board Columns

Add the working columns you want on the board, for example:

- `Doing`
- `Blocked`
- `Ready for Review`

Save when done.

## How to use Cerulean

### Main board

- Cerulean loads work items in the configured **Source State**
- Board layout and settings are saved in browser `localStorage`
- Use the refresh button in the header to force a refetch

### Candidate tray

If **Candidate State** is set, Cerulean shows a **New Work** column for candidate items.

Dragging an item:

- from **New Work** into a board column:
  - assigns the item to the current Azure DevOps user
  - changes the work item state to **Source State**
- from a board column back into **New Work**:
  - clears the assignee
  - changes the work item state back to **Candidate State**

### Completed column

If **Approval State** is set, Cerulean adds a **Completed** column.

Dragging an item into **Completed** changes the Azure DevOps work item state to **Approval State**.

Dragging an item back out of **Completed** changes the state back to **Source State**.

### Demo mode

If **Approval State** is configured, the header shows a **Demo** toggle.

Demo mode loads items in the approval state into a review list:

- **Approve** moves an item to **Closed State**
- **Unapprove** moves it back to **Approval State**

### Custom tasks

You can add local custom tasks from the board. These exist only in the browser and are not created in Azure DevOps.

## Security notes

- Cerulean stores your settings, including the PAT, in browser `localStorage` on the machine running the app.
- Prefer a short-lived PAT.
- Revoke and replace the PAT if you think it was exposed.
