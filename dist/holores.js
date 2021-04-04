"use strict";
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
const config = require('../config.json');
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
