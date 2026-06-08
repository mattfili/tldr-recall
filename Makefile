# Recall — common dev tasks (M0).
# `make help` lists targets. Recipe lines use real tabs.

.DEFAULT_GOAL := help
.PHONY: help up down backend frontend desktop test lint migrate seed

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

up: ## Start local Postgres + pgvector (docker)
	docker compose up -d db

down: ## Stop local infra
	docker compose down

backend: ## Run the FastAPI backend (http://localhost:8000)
	cd backend && uv run uvicorn recall.main:app --reload --port 8000

frontend: ## Run the Vite dev server (http://localhost:5173)
	cd frontend && npm run dev

desktop: ## Run the Electron desktop shell
	cd desktop && npm start

test: ## Run backend (pytest) + frontend (vitest) tests
	cd backend && uv run pytest
	cd frontend && npm test

lint: ## Lint backend (ruff) + frontend (eslint)
	cd backend && uv run ruff check .
	cd frontend && npm run lint

migrate: ## Run database migrations
	@echo "added in #2"

seed: ## Seed the database from the prototype fixtures
	@echo "added in #2"
