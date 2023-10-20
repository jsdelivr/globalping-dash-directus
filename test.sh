#!/bin/bash

set -e

directories=$(find ./src -type d -name "node_modules" -prune -o -type f -name "package.json" -exec dirname {} \;)

echo "Extensions directories:"
echo "$directories"

for dir in $directories; do
	(
		echo "Directory: $dir"
		cd "$dir"
		npm i
		npm run build
		npm run test
	)
done
