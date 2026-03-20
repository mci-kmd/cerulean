# Cerulean

Cerulean is a local Vite + React app for working Azure DevOps items in a drag-and-drop board.

It can also show assigned pull requests from an optional public GitHub repository as read-only review cards.

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
- **Team**: the Azure DevOps team whose board Cerulean should treat as the source of `New Work`. Required for board-column-based behavior.
- **GitHub Username**: optional username for public GitHub review cards
- **GitHub Repository**: optional public repo in `owner/repo` format or full GitHub URL

Notes:

- Organization input can be just the org name or a full Azure DevOps URL.
- Project input can be the project name or a URL containing the project.
- GitHub review cards are read-only and do not require credentials for public repositories.
- Cerulean refreshes the public GitHub source less aggressively than ADO to avoid unauthenticated rate limits.
- Use **Test Connection** before saving.

### Board Columns

Add the working columns you want on the board, for example:

- `Doing`
- `Blocked`
- `Ready for Review`

Save when done.

## How to use Cerulean

### Main board

- Cerulean loads current work from **Source Board Column**
- Board layout and settings are saved in browser `localStorage`
- Use the refresh button in the header to force a refetch

### Candidate tray

If Cerulean can resolve the selected team's requirement board, it loads **New Work** from that board's incoming column for unassigned items.

Dragging an item:

- from **New Work** into a board column:
  - assigns the item to the current Azure DevOps user
  - moves the item to **Source Board Column**
  - changes the work item state to **Source Board Column**'s mapped state for the work item type
- from a board column back into **New Work**:
  - clears the assignee
  - moves the item back to the selected team's intake column
  - changes the work item state to that intake column's mapped state for the work item type

### Completed column

If **Approval Board Column** is set, Cerulean adds a **Completed** column.

Cerulean loads completed items from **Approval Board Column**.

Dragging an item into **Completed** changes the Azure DevOps work item state to that source-board column's mapped state and moves it to **Approval Board Column**.

Dragging an item back out of **Completed** changes the state to **Source Board Column**'s mapped source-board state and moves it to **Source Board Column**.

### Demo mode

If **Approval Board Column** and **Closed State** are configured, the header shows a **Demo** toggle.

Demo mode loads items from the approval board column into a review list:

- **Approve** moves an item to **Closed State**
- **Unapprove** moves it back to the mapped state for **Approval Board Column**

### Custom tasks

You can add local custom tasks from the board. These exist only in the browser and are not created in Azure DevOps.

## Security notes

- Cerulean stores your settings, including the PAT, in browser `localStorage` on the machine running the app.
- Prefer a short-lived PAT.
- Revoke and replace the PAT if you think it was exposed.
