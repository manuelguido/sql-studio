<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Inertia\Response;

class QueryVisualizerController extends Controller
{
    public function __invoke(): Response
    {
        return Inertia::render('Queries/Index', [
            'examples' => [
                [
                    'id' => 'revenue-cohorts',
                    'name' => 'Revenue Cohorts',
                    'dialect' => 'PostgreSQL',
                    'risk' => 'Medium',
                    'latency' => '184 ms',
                    'rows' => '42k',
                    'sql' => "WITH cohort_revenue AS (\n    SELECT\n        DATE_TRUNC('month', users.created_at) AS cohort_month,\n        DATE_TRUNC('month', orders.created_at) AS order_month,\n        SUM(orders.total_cents) / 100.0 AS revenue\n    FROM users\n    INNER JOIN orders ON orders.user_id = users.id\n    WHERE orders.status = 'paid'\n    GROUP BY cohort_month, order_month\n)\nSELECT\n    cohort_month,\n    order_month,\n    revenue,\n    revenue / NULLIF(SUM(revenue) OVER (PARTITION BY cohort_month), 0) AS revenue_share\nFROM cohort_revenue\nORDER BY cohort_month DESC, order_month ASC;",
                    'plan' => [
                        ['id' => 'scan-users', 'label' => 'Seq scan users', 'cost' => 18, 'rows' => 12000, 'type' => 'scan'],
                        ['id' => 'idx-orders', 'label' => 'Index scan orders', 'cost' => 42, 'rows' => 42000, 'type' => 'index'],
                        ['id' => 'hash-join', 'label' => 'Hash join', 'cost' => 61, 'rows' => 38000, 'type' => 'join'],
                        ['id' => 'aggregate', 'label' => 'Group aggregate', 'cost' => 76, 'rows' => 620, 'type' => 'aggregate'],
                        ['id' => 'window', 'label' => 'Window function', 'cost' => 84, 'rows' => 620, 'type' => 'window'],
                    ],
                    'edges' => [['scan-users', 'hash-join'], ['idx-orders', 'hash-join'], ['hash-join', 'aggregate'], ['aggregate', 'window']],
                ],
                [
                    'id' => 'inventory-health',
                    'name' => 'Inventory Health',
                    'dialect' => 'PostgreSQL',
                    'risk' => 'Low',
                    'latency' => '72 ms',
                    'rows' => '8.6k',
                    'sql' => "SELECT\n    products.sku,\n    products.name,\n    warehouses.region,\n    SUM(inventory.quantity) AS on_hand,\n    AVG(sales.daily_units) AS avg_daily_units\nFROM products\nLEFT JOIN inventory ON inventory.product_id = products.id\nLEFT JOIN warehouses ON warehouses.id = inventory.warehouse_id\nLEFT JOIN sales ON sales.product_id = products.id\nWHERE products.active = true\nGROUP BY products.sku, products.name, warehouses.region\nHAVING SUM(inventory.quantity) < AVG(sales.daily_units) * 14\nORDER BY on_hand ASC;",
                    'plan' => [
                        ['id' => 'scan-products', 'label' => 'Bitmap scan products', 'cost' => 14, 'rows' => 8600, 'type' => 'index'],
                        ['id' => 'join-inventory', 'label' => 'Left join inventory', 'cost' => 31, 'rows' => 23000, 'type' => 'join'],
                        ['id' => 'join-sales', 'label' => 'Left join sales', 'cost' => 49, 'rows' => 23000, 'type' => 'join'],
                        ['id' => 'aggregate', 'label' => 'Hash aggregate', 'cost' => 64, 'rows' => 8600, 'type' => 'aggregate'],
                        ['id' => 'sort', 'label' => 'Sort low stock', 'cost' => 72, 'rows' => 840, 'type' => 'sort'],
                    ],
                    'edges' => [['scan-products', 'join-inventory'], ['join-inventory', 'join-sales'], ['join-sales', 'aggregate'], ['aggregate', 'sort']],
                ],
                [
                    'id' => 'support-sla',
                    'name' => 'Support SLA',
                    'dialect' => 'PostgreSQL',
                    'risk' => 'High',
                    'latency' => '421 ms',
                    'rows' => '218k',
                    'sql' => "SELECT\n    tickets.id,\n    accounts.plan,\n    agents.team,\n    EXTRACT(EPOCH FROM tickets.first_response_at - tickets.created_at) / 60 AS response_minutes,\n    RANK() OVER (PARTITION BY accounts.plan ORDER BY tickets.created_at DESC) AS recency_rank\nFROM tickets\nINNER JOIN accounts ON accounts.id = tickets.account_id\nINNER JOIN agents ON agents.id = tickets.assigned_agent_id\nWHERE tickets.status IN ('open', 'pending')\nAND tickets.created_at >= NOW() - INTERVAL '30 days'\nORDER BY response_minutes DESC\nLIMIT 100;",
                    'plan' => [
                        ['id' => 'scan-tickets', 'label' => 'Range scan tickets', 'cost' => 92, 'rows' => 218000, 'type' => 'scan'],
                        ['id' => 'join-accounts', 'label' => 'Join accounts', 'cost' => 126, 'rows' => 218000, 'type' => 'join'],
                        ['id' => 'join-agents', 'label' => 'Join agents', 'cost' => 158, 'rows' => 218000, 'type' => 'join'],
                        ['id' => 'window', 'label' => 'Rank window', 'cost' => 311, 'rows' => 218000, 'type' => 'window'],
                        ['id' => 'limit', 'label' => 'Top 100 limit', 'cost' => 421, 'rows' => 100, 'type' => 'limit'],
                    ],
                    'edges' => [['scan-tickets', 'join-accounts'], ['join-accounts', 'join-agents'], ['join-agents', 'window'], ['window', 'limit']],
                ],
            ],
            'schema' => [
                ['table' => 'users', 'rows' => '12k', 'indexes' => ['users_pkey', 'idx_users_created_at']],
                ['table' => 'orders', 'rows' => '42k', 'indexes' => ['orders_pkey', 'idx_orders_user_status']],
                ['table' => 'products', 'rows' => '8.6k', 'indexes' => ['products_pkey', 'idx_products_active']],
                ['table' => 'inventory', 'rows' => '23k', 'indexes' => ['inventory_product_id_index']],
                ['table' => 'tickets', 'rows' => '218k', 'indexes' => ['tickets_pkey', 'idx_tickets_status_created']],
                ['table' => 'accounts', 'rows' => '18k', 'indexes' => ['accounts_pkey']],
                ['table' => 'agents', 'rows' => '420', 'indexes' => ['agents_pkey']],
            ],
        ]);
    }
}