"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPRESSION_QUALITY = exports.CompressionLevel = void 0;
var CompressionLevel;
(function (CompressionLevel) {
    CompressionLevel["HIGH"] = "high";
    CompressionLevel["MEDIUM"] = "medium";
    CompressionLevel["LOW"] = "low";
})(CompressionLevel || (exports.CompressionLevel = CompressionLevel = {}));
exports.COMPRESSION_QUALITY = {
    [CompressionLevel.HIGH]: 95,
    [CompressionLevel.MEDIUM]: 85,
    [CompressionLevel.LOW]: 70,
};
