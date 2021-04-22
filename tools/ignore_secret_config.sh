#!/usr/bin/env bash

# ignore changes to secret config files, even though they are commited to git
# .gitignore doesn't help here
# Note: paths are relative to git root
git update-index --assume-unchanged config/db.config.json config/auth.secret
