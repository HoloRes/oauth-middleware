"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const GroupLinkSchema = new mongoose_1.default.Schema({
    _id: { type: String, required: true },
    jiraName: { type: String, required: true },
    baseRole: { type: Boolean, default: false },
});
exports.default = mongoose_1.default.model('GroupLink', GroupLinkSchema, 'groups');
