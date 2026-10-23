# Short names for the Web and Desktop application commands. The package.json
# scripts they call stay the source of truth; docs/development.md documents both.
.DEFAULT_GOAL := help
.PHONY: help build clean web desktop dev-web dev-desktop desktop-flowleap desktop-flowleap-dir

PNPM ?= pnpm
ARGS ?=

help:
	@echo "make build        pnpm run build           complete repository build"
	@echo "make clean        pnpm run clean           remove build outputs and safe deleted-package residue"
	@echo "make web          pnpm run start:web       serve the built Web artifacts from source"
	@echo "make desktop      pnpm run start:desktop   launch the built Desktop artifacts"
	@echo "make dev-web      pnpm run dev:web         build, serve, and rebuild Web on source edits"
	@echo "make dev-desktop  pnpm run dev:desktop     build, then launch Desktop"
	@echo "make desktop-flowleap      DSH_DESKTOP_PRODUCT=flowleap pnpm run package:desktop:mac:arm64:unsigned"
	@echo "                           unsigned FlowLeap Patent AI macOS arm64 build (.app and .dmg)"
	@echo "make desktop-flowleap-dir  the same build stopped at the unpacked .app"
	@echo "ARGS='--no-open --port 3081' forwards options to the launched application;"
	@echo "the Web commands accept dsh web flags, the Desktop launcher accepts none."

build:
	$(PNPM) run build

clean:
	$(PNPM) run clean

web:
	$(PNPM) run start:web $(ARGS)

desktop:
	$(PNPM) run start:desktop $(ARGS)

dev-web:
	$(PNPM) run dev:web $(ARGS)

dev-desktop:
	$(PNPM) run dev:desktop $(ARGS)

# The FlowLeap product file selects the brand, the flowleap-web profile, and switches the vendor behaviours off;
# apps/desktop/README.md "FlowLeap product configuration" documents it. Unsigned: milestone 2 adds signing.
desktop-flowleap:
	DSH_DESKTOP_PRODUCT=flowleap $(PNPM) run package:desktop:mac:arm64:unsigned $(ARGS)

desktop-flowleap-dir:
	DSH_DESKTOP_PRODUCT=flowleap $(PNPM) run package:desktop:mac:arm64:dir $(ARGS)
