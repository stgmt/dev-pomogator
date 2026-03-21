# Design

## Architecture

The system uses dataProcessor to manage import settings.
Export module reads DataProcessor for template paths.
The featureConfig stores runtime parameters.

## Components

- ImportService: handles CSV parsing with dataProcessor
- ExportService: generates PDF using DataProcessor
- ValidationService: checks schema compliance before import

## Infrastructure

The system uses PostgreSQL database for persistent storage.

## Environment Variables

- DATABASE_URL=postgresql://user:pass@localhost:5432/app
- REDIS_HOST=localhost
- SMTP_API_KEY=sg_xxx
- N8N_BASIC_AUTH_USER=admin
- N8N_BASIC_AUTH_PASSWORD=secret
