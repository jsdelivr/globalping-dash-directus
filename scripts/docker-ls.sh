#!/bin/bash

set -e

# Find all directories with a package.json file in /src (excluding node_modules)
directories=$(find src -type d -name "node_modules" -prune -o -type f -name "package.json" -exec dirname {} \;)

# /lib directory should be installed first
directories="src/extensions/lib $directories"

for dir in $directories; do
	(
		echo "COPY $dir/package.json $dir/"
	)
done
