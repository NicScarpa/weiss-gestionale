# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Guidelines

1. **Think first, read the codebase** - Before starting any task, think through the problem and read relevant files in the codebase.

2. **Check in before major changes** - Before making any significant changes, check in with the user to verify the plan.

3. **Explain changes at each step** - Provide a high-level explanation of what changes were made at every step.

4. **Keep it simple** - Make every task and code change as simple as possible. Avoid massive or complex changes. Every change should impact as little code as possible. Simplicity is key.

5. **Maintain architecture documentation** - Keep a documentation file that describes how the architecture of the app works inside and out.

6. **Never speculate about code** - Never make claims about code you haven't opened. If a specific file is referenced, MUST read the file before answering. Investigate and read relevant files BEFORE answering questions about the codebase. Give grounded, hallucination-free answers.

## Plan and review
Before starting work
Before you begin write a detailed implementation plan in a file named claude/tasks/TASK_NAME.md

This plan should include

A clear, detailed breakdown of the implementation steps.

The reasoning behind your approach.

A list of specific tasks.

Focus on Minimum Viable Product (MVP) to avoid over planning. Once the plan is ready, please ask me to review it. Do not proceed with implementation until i have approved the plan.

## While implementing
    
As you work, keep the plan updated. After you complete a task, append a detailed description of the changes you've made to the plan. This ensire that the progress and next steps are clear and can be easily handed over to other engineers if needed.

## Project Overview

Sistema Gestionale Weiss Cafè - a web application for accounting and administrative management of a cocktail bar in Sacile (PN), Italy. Replaces a complex Excel-based system (~30 sheets) with digital cash closure forms, ledger management, and financial reporting.

**Current Status**: Planning/requirements phase with detailed PRD documentation. No code implemented yet.

## Recommended Tech Stack

- **Frontend**: React/Next.js + TailwindCSS (PWA, mobile-first)
- **Backend**: Node.js/Express or Python/FastAPI
- **Database**: PostgreSQL
- **Auth**: JWT + Role-based access control (RBAC)
- **Hosting**: Cloud (AWS/Vercel/Railway)

## Architecture Priorities

### Phase 1 MVP - Core Features
1. Authentication with RBAC (admin, manager, staff roles)
2. Daily cash closure form - **must be PWA with offline-first capability**
3. Cash and bank ledgers (prima nota)
4. Basic reports (daily revenue, YoY comparison)
5. Master data (users, suppliers, chart of accounts)

### Key Domain Entities
- `venues` - Multiple locations (Weiss Cafè, Villa Varda, Casette)
- `daily_closures` - Daily cash closure records with workflow states (draft → submitted → validated)
- `cash_stations` - Multiple registers per venue (BAR, CASSA 1-3, TAVOLI, MARSUPIO)
- `journal_entries` - Accounting ledger movements (cash and bank)
- `accounts` - Hierarchical chart of accounts

## Critical Implementation Notes

### Financial Calculations
- Use `DECIMAL(10,2)` for all money fields, never FLOAT
- Default VAT rate: 10% (configurable per venue)
- Default cash float: €114.00
- All timestamps in Europe/Rome timezone

### Cash Closure Form (Core Feature)
- Must work offline with automatic sync when online
- Touch-optimized with minimum 44x44px buttons
- Real-time cash difference detection (alert threshold: €5.00)
- Bill/coin counting grid (€500 down to €0.01)
- Staff attendance codes: FE (vacation), R (rest), Z (leave), C (other venue)

### Automated Journal Entry Generation
When a cash closure is validated:
- Generate cash debit for daily receipts
- Generate cash credits for all expenses
- Generate bank transfer if deposit recorded
- Auto-categorize based on account mappings

## Italian Fiscal Compliance

- SDI (Sistema di Interscambio) integration for electronic invoice import (Phase 2)
- F24 tax payment tracking
- LIPE quarterly VAT reporting
- All amounts display with comma as decimal separator (€1.234,56)

## Key Business Metrics

- Labor cost % target: 30% of revenue
- Budget variance alert threshold: 10%
- Price change alert threshold: 5%

## Documentation

Detailed requirements in `/PRD/`:
- `PRD_v1_1.md` - Main PRD with database schema, user stories, wireframes
- `PRD_Modulo_Gestione_Personale_v1.0.md` - Staff management module specs
