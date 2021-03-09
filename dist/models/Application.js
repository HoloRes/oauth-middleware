"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const biguint_format_1 = __importDefault(require("biguint-format"));
const flake_idgen_1 = __importDefault(require("flake-idgen"));
const flakeIdGen = new flake_idgen_1.default();
const ApplicationSchema = new mongoose_1.default.Schema({
    _id: { type: String, default: biguint_format_1.default(flakeIdGen.next(), 'dec').toString() },
    name: { type: String, required: true },
    redirectUrl: { type: String, required: true },
    clientSecret: { type: String, required: true },
});
exports.default = mongoose_1.default.model('Application', ApplicationSchema, 'applications');
