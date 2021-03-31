"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
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
Object.defineProperty(exports, "__esModule", { value: true });
// Imports
const express_1 = require("express");
const index_1 = require("./index");
const config = __importStar(require("../config.json"));
// Init
const router = express_1.Router();
exports.default = router;
router.use((req, res, next) => {
    if (req.get('Authorization') === config.holores.token)
        next();
    else
        res.status(403).end();
});
// Routes
router.get('/adminCheck', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.query;
    const guild = yield index_1.client.guilds.fetch(config.holores.serverId)
        .catch(() => res.status(400).end());
    // @ts-expect-error Guild possibly null
    const member = yield guild.members.fetch(id)
        .catch(() => res.status(400).end());
    res.status(200).send(member.roles.cache.has(config.holores.adminRoleId));
}));
router.get('/artistCheck', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.query;
    const guild = yield index_1.client.guilds.fetch(config.holores.serverId)
        .catch(() => res.status(400).end());
    // @ts-expect-error Guild possibly null
    const member = yield guild.members.fetch(id)
        .catch(() => res.status(400).end());
    res.status(200).send(member.roles.cache.has(config.holores.artistRoleId));
}));
