# Design

## Architecture

The system uses dataProcessor to manage import settings.
Export module reads DataProcessor for template paths.
The featureConfig stores runtime parameters.

## Components

- ImportService: handles CSV parsing with dataProcessor
- ExportService: generates PDF using DataProcessor
