<?php

use App\Http\Controllers\QueryVisualizerController;
use Illuminate\Support\Facades\Route;

Route::get('/', QueryVisualizerController::class)->name('queries.index');
