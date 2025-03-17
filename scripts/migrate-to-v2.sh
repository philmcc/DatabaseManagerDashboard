#!/bin/bash

# Migration to Query Monitoring V2
# This script provides utilities for migrating to the new query monitoring system

echo "=== Query Monitoring V2 Migration Utilities ==="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run these scripts."
    exit 1
fi

# Display menu
show_menu() {
    echo "Choose an option:"
    echo "1) Verify migration status"
    echo "2) Run migration script"
    echo "3) Check old vs. new tables"
    echo "4) View normalized queries"
    echo "5) Drop old tables (DANGER!)"
    echo "6) Exit"
    echo ""
    read -p "Enter choice [1-6]: " choice
}

# Main logic
while true; do
    show_menu
    
    case $choice in
        1)
            echo "Running migration verification..."
            node scripts/verify-migration.js
            ;;
        2)
            echo "Running migration script..."
            node scripts/run-query-monitoring-v2-migration.js
            ;;
        3)
            echo "Checking table status..."
            node scripts/check-tables.js
            ;;
        4)
            echo "Launching normalized queries viewer..."
            node scripts/view-normalized-queries.js
            ;;
        5)
            echo "WARNING: This will drop the old tables!"
            read -p "Are you sure you want to proceed? (yes/no): " confirm
            if [ "$confirm" = "yes" ]; then
                node scripts/drop-old-tables.js
            else
                echo "Operation cancelled."
            fi
            ;;
        6)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid option. Please try again."
            ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
    clear
done 