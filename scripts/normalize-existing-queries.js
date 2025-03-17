"use strict";
/**
 * Normalize Existing Queries
 *
 * This script updates all existing queries in the database with normalized versions
 * using the query normalizer utility. It helps in consolidating structurally identical
 * queries with different parameter counts.
 */
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var index_js_1 = require("../db/index.js");
var schema_js_1 = require("../db/schema.js");
var query_normalizer_js_1 = require("../server/utils/query-normalizer.js");
var drizzle_orm_1 = require("drizzle-orm");
var drizzle_orm_2 = require("drizzle-orm");
function normalizeExistingQueries() {
    return __awaiter(this, void 0, void 0, function () {
        var queries, batchSize, processedCount, updatedCount, mergedCount, i, batch, _i, batch_1, query, _a, normalizedQuery, normalizedHash, existingNormalizedQuery, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    console.log('Starting normalization of existing queries...');
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 14, 15, 16]);
                    return [4 /*yield*/, index_js_1.db.query.discoveredQueries.findMany({
                            where: (0, drizzle_orm_1.isNull)(schema_js_1.discoveredQueries.normalizedQuery)
                        })];
                case 2:
                    queries = _b.sent();
                    console.log("Found ".concat(queries.length, " queries to normalize"));
                    batchSize = 100;
                    processedCount = 0;
                    updatedCount = 0;
                    mergedCount = 0;
                    i = 0;
                    _b.label = 3;
                case 3:
                    if (!(i < queries.length)) return [3 /*break*/, 13];
                    batch = queries.slice(i, i + batchSize);
                    _i = 0, batch_1 = batch;
                    _b.label = 4;
                case 4:
                    if (!(_i < batch_1.length)) return [3 /*break*/, 12];
                    query = batch_1[_i];
                    // Skip if already processed
                    if (query.normalizedQuery)
                        return [3 /*break*/, 11];
                    _a = (0, query_normalizer_js_1.normalizeAndHashQuery)(query.queryText), normalizedQuery = _a.normalizedQuery, normalizedHash = _a.normalizedHash;
                    return [4 /*yield*/, index_js_1.db.query.discoveredQueries.findFirst({
                            where: (0, drizzle_orm_1.eq)(schema_js_1.discoveredQueries.normalizedQuery, normalizedQuery)
                        })];
                case 5:
                    existingNormalizedQuery = _b.sent();
                    if (!(existingNormalizedQuery && existingNormalizedQuery.id !== query.id)) return [3 /*break*/, 8];
                    // Merge statistics and delete the duplicate
                    return [4 /*yield*/, index_js_1.db.update(schema_js_1.discoveredQueries)
                            .set({
                            callCount: existingNormalizedQuery.callCount + query.callCount,
                            totalTime: (0, drizzle_orm_2.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " + ", ""], ["", " + ", ""])), existingNormalizedQuery.totalTime, query.totalTime),
                            minTime: (0, drizzle_orm_2.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["LEAST(", ", ", ")"], ["LEAST(", ", ", ")"])), existingNormalizedQuery.minTime || 'NULL', query.minTime || 'NULL'),
                            maxTime: (0, drizzle_orm_2.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["GREATEST(", ", ", ")"], ["GREATEST(", ", ", ")"])), existingNormalizedQuery.maxTime || 'NULL', query.maxTime || 'NULL'),
                            firstSeenAt: new Date(Math.min(new Date(existingNormalizedQuery.firstSeenAt).getTime(), new Date(query.firstSeenAt).getTime())),
                            lastSeenAt: new Date(Math.max(new Date(existingNormalizedQuery.lastSeenAt).getTime(), new Date(query.lastSeenAt).getTime())),
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_1.eq)(schema_js_1.discoveredQueries.id, existingNormalizedQuery.id))];
                case 6:
                    // Merge statistics and delete the duplicate
                    _b.sent();
                    // Delete the duplicate
                    return [4 /*yield*/, index_js_1.db.delete(schema_js_1.discoveredQueries)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.discoveredQueries.id, query.id))];
                case 7:
                    // Delete the duplicate
                    _b.sent();
                    mergedCount++;
                    return [3 /*break*/, 10];
                case 8: 
                // Update the query with normalized form
                return [4 /*yield*/, index_js_1.db.update(schema_js_1.discoveredQueries)
                        .set({
                        normalizedQuery: normalizedQuery,
                        updatedAt: new Date()
                    })
                        .where((0, drizzle_orm_1.eq)(schema_js_1.discoveredQueries.id, query.id))];
                case 9:
                    // Update the query with normalized form
                    _b.sent();
                    updatedCount++;
                    _b.label = 10;
                case 10:
                    processedCount++;
                    // Log progress
                    if (processedCount % 100 === 0 || processedCount === queries.length) {
                        console.log("Processed ".concat(processedCount, "/").concat(queries.length, " queries, Updated: ").concat(updatedCount, ", Merged: ").concat(mergedCount));
                    }
                    _b.label = 11;
                case 11:
                    _i++;
                    return [3 /*break*/, 4];
                case 12:
                    i += batchSize;
                    return [3 /*break*/, 3];
                case 13:
                    console.log("\nNormalization complete!");
                    console.log("Total queries processed: ".concat(processedCount));
                    console.log("Queries updated with normalization: ".concat(updatedCount));
                    console.log("Duplicate queries merged: ".concat(mergedCount));
                    return [3 /*break*/, 16];
                case 14:
                    error_1 = _b.sent();
                    console.error('Error normalizing queries:', error_1);
                    return [3 /*break*/, 16];
                case 15:
                    // Close database connection
                    process.exit(0);
                    return [7 /*endfinally*/];
                case 16: return [2 /*return*/];
            }
        });
    });
}
// Run the script
normalizeExistingQueries();
var templateObject_1, templateObject_2, templateObject_3;
