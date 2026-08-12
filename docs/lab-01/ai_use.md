# Lab 1 — AI Usage Documentation

## 1. Environment & LLM Info

| Field | Detail |
| --- | --- |
| Agent / Tool | [e.g., Antigravity agent, Claude Code] |
| Model | [e.g., Gemini 3.6 Flash, Claude Sonnet 5] |
| Thinking Level | [e.g., High / Medium / Low] |
| Student Name | Thawat Boonsuk |
| Student ID | 67070501024 |

## 2. Selected Key Prompts

| Prompt Name | Actual Prompt Text | My Reflection |
| --- | --- | --- |
| Plan Lab 1 Implementation | - | - |
| Set Up Full-Stack Project | Acceptance criteria:<br>· React + TypeScript + Vite frontend starts successfully.<br>· Bootstrap is installed and visible in the frontend.<br>· Node.js + Express + TypeScript backend starts successfully.<br>· PostgreSQL is reachable and Prisma is initialized.<br>· Vitest and Supertest commands are configured.<br>· `.gitignore` and `.env.example` exist; secrets and `node_modules` are not committed.<br>· Initial README setup instructions are present. | I want you to recheck if all these criteria were done correctly. |
| Implement Health Check | Type: Feature<br>Required branch: feature/2-health-check<br>Acceptance criteria:<br>· GET /api/health returns HTTP 200.<br>· The JSON response contains status = ok and service = TokTickIT API.<br>· A Supertest test verifies the endpoint.<br>· The React page displays the backend status based on a real API call.<br>· A useful error message appears when the backend is unavailable. | Recheck again if all the criteria were done correctly and completely |
| Implement Category Feature | Type: Database preparation<br>Required branch: feature/3-category-seed<br>Acceptance criteria:<br>· A Prisma Category model exists with id, unique name, and createdAt.<br>· A migration creates the Category table.<br>· The seed inserts Account and Access, Hardware, Software, and Network.<br>· The seed is safe to run more than once without duplicates.<br>· Database credentials are not committed. | - |
| Build and Test Check System UI | Type: Feature<br>Required branch: feature/4-category-list<br>Acceptance criteria:<br>· GET /api/categories retrieves categories from PostgreSQL through Prisma.<br>· The API returns each category ID and name in a predictable order.<br>· A Supertest test verifies the response.<br>· React displays the categories returned by the API, not hard-coded values.<br>· Loading and error states are shown.<br>· A Vitest test verifies the category-list UI behavior. | - |
| Review Final Lab 1 Work | - | I use my friend as a reviewer |

## 3. Overall Reflection

There are just a few things to fix the responses of AI Agent but Overall is fine.
