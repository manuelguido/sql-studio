# SQL Studio

SQL Studio is a local workspace for designing relational database schemas. It keeps SQL text, a visual table graph, and a table inspector connected so you can reason about structure while still owning the DDL.

The application does not connect to a database server or execute SQL. It is for modeling tables, columns, keys, and relationships before those definitions move into migrations or hand-authored SQL files.

## Modeling Workflow

SQL schema design often bounces between two views:

- the exact DDL you will commit
- the relationship graph you need to reason about

SQL Studio keeps those views in sync. The SQL text is the source of truth. Visual operations mutate the schema model, serialize it back to canonical SQL, and let the parser re-read it.

That gives you a quick way to:

- sketch tables and columns
- inspect foreign-key relationships
- rename tables and columns safely
- create relationships by dragging between columns
- download the resulting SQL
- work locally without a database connection

## How It Works

SQL Studio parses supported `CREATE TABLE` statements from the editor, builds an in-memory schema model, renders tables and foreign keys on a canvas, and serializes visual edits back into SQL. Unsupported SQL is ignored or reported as a parse warning instead of being executed.

## Current Capabilities

### SQL Editor

- Textarea editor with line gutter.
- SQL syntax highlighting layer.
- Tab indentation handling.
- Parse warning count.
- New-table snippet insertion.
- Load `.sql` or plain text files.
- Download the current SQL as `schema.sql`.
- Save, cancel, and dirty-state tracking through localStorage.

### Visual Schema Graph

- Table cards rendered on a large scrollable canvas.
- Drag tables to reposition them.
- Positions snap to an 8px grid.
- Foreign-key lines are drawn as SVG paths.
- Click a relation to inspect it.
- Drag from a column anchor to another column to create a foreign key.
- Auto-layout by dependency depth.
- Related tables and selected relations are highlighted.

### Inspector

- Table list with column counts.
- Table rename with identifier sanitization.
- Add and remove tables.
- Add, edit, and remove columns.
- Edit column type, default value, primary key, `NOT NULL`, and `UNIQUE`.
- See outgoing and incoming foreign keys.
- Delete a selected relation.
- Drop a table with confirmation. Foreign keys pointing to that table are removed.

### Editing Workflow

- Undo and redo with a 100-snapshot history stack.
- In-memory copy/paste for selected tables.
- Copy/paste does not touch the system clipboard, so text editing remains predictable.
- Pasted tables receive unique names and offset positions.
- Foreign keys are dropped on pasted tables to avoid dangling references.

## Parser Scope

The SQL parser is intentionally narrow and dialect-tolerant. It extracts `CREATE TABLE` statements and ignores unrelated SQL.

It supports:

- line and block comments
- `CREATE TABLE`
- `CREATE TEMP TABLE`
- `CREATE TABLE IF NOT EXISTS`
- quoted identifiers with backticks, double quotes, or single quotes
- schema-qualified table names, with the schema prefix dropped
- column definitions
- inline primary keys
- table-level primary keys
- inline references
- table-level foreign keys
- table-level unique constraints
- basic default values

It ignores or only partially models:

- indexes
- check constraints
- triggers
- views
- inserts
- alters
- drops
- stored procedures
- database-specific options outside the `CREATE TABLE (...)` body

The serializer emits straightforward `CREATE TABLE` statements without database-specific extensions.

## Architecture

```text
app/Http/Controllers/PlaygroundController.php
    Serves the Inertia playground.

resources/js/Pages/Playground/Index.vue
    Main layout: chrome, editor, graph, inspector, and status bar.

resources/js/Composables/usePlayground.js
    Shared state, localStorage persistence, parse scheduling, save/cancel,
    file download, selection, positioning, and auto-layout.

resources/js/Composables/useSqlParser.js
    SQL to schema extraction.

resources/js/Composables/useSqlSerializer.js
    Schema model back to canonical CREATE TABLE statements.

resources/js/Composables/useSchemaEditor.js
    History-aware table, column, and foreign-key mutations.

resources/js/Components/SqlEditor.vue
    SQL editing surface and syntax highlighting overlay.

resources/js/Components/SchemaGraph.vue
    Table canvas and relation drawing.

resources/js/Components/TableInspector.vue
    Table and relation editing panel.
```

## Data Model

The parsed schema shape is simple:

```js
{
  tables: [
    {
      name: 'users',
      columns: [
        {
          name: 'id',
          type: 'INTEGER',
          pk: true,
          nullable: false,
          unique: false,
          default: null
        }
      ],
      primaryKey: ['id'],
      foreignKeys: [
        {
          column: 'owner_id',
          refTable: 'users',
          refColumn: 'id'
        }
      ]
    }
  ],
  errors: []
}
```

Positions and selected UI state are stored separately from SQL. The SQL text remains the durable source.

## Stack

| Layer | Tools |
| --- | --- |
| Backend | Laravel 13, PHP 8.3+, Inertia Laravel |
| Frontend | Vue 3, Vite, Tailwind CSS 4 |
| Parsing | Custom `CREATE TABLE` parser |
| UI | lucide-vue-next |
| Quality | PHPUnit, Pint, ESLint, Prettier |

## Local Setup

```bash
composer install
npm ci
cp .env.example .env
php artisan key:generate
```

Configure the database connection in `.env` before running migrations.

```bash
php artisan migrate
```

Run the full development stack:

```bash
composer dev
```

Or run the pieces separately:

```bash
php artisan serve
npm run dev
```

## Build

```bash
npm run build
```

## Tests And Checks

Run PHP tests:

```bash
composer test
```

Run PHP formatting:

```bash
composer lint
```

Run frontend checks:

```bash
npm run lint:check
npm run format:check
```

Apply frontend fixes:

```bash
npm run lint:fix
npm run format
```

## Current Limits

- No database connection or SQL execution.
- No migration generation beyond canonical `CREATE TABLE` output.
- No visual diff, migration ordering, or destructive-change analysis.
- Parser coverage is focused on table structure, not full SQL grammar.
- Parser and serializer tests would be the highest-value next step.

## Contributing

The main contract is round-tripping:

```text
SQL -> parseSql -> schema -> serializeSchema -> SQL
```

Changes to parsing or visual editing should preserve that contract for supported `CREATE TABLE` input.

Useful contributions:

- unit tests for parser edge cases
- unit tests for serializer output
- better parse warnings for unsupported DDL
- improved auto-layout for dense schemas
- additional column metadata that serializes cleanly

Before opening a pull request, run:

```bash
composer test
npm run lint:check
npm run format:check
npm run build
```

## License

SQL Studio is open-sourced under the MIT license. See `LICENSE`.
