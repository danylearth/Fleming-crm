#!/bin/bash
# Watch for changes and auto-deploy to Railway

echo "👀 Watching for changes and auto-deploying to Railway..."
echo "Press Ctrl+C to stop"
echo ""

# Install fswatch if not present (macOS)
if ! command -v fswatch &> /dev/null; then
    echo "Installing fswatch for file watching..."
    if command -v brew &> /dev/null; then
        brew install fswatch
    else
        echo "⚠️  Please install fswatch manually: brew install fswatch"
        exit 1
    fi
fi

# Watch backend directory for changes
fswatch -o backend/src backend/package.json nixpacks.toml railway.json | while read change
do
    echo ""
    echo "🔄 Change detected, deploying..."
    ./deploy.sh
    echo ""
    echo "👀 Watching for more changes..."
done
