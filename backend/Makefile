# KB admin console — dev convenience targets.
# `make dev` bootstraps deps and runs proxy + SPA together (see dev.sh).

.PHONY: dev install build clean

dev:
	./dev.sh

install:
	python3 -m venv server/.venv
	./server/.venv/bin/pip install -r server/requirements.txt
	cd web && npm install

build:
	cd web && npm run build

clean:
	rm -rf server/.venv web/node_modules web/dist
