"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
var core_1 = require("@angular/core");
var MarkedComponent = (function () {
    function MarkedComponent() {
    }
    return MarkedComponent;
}());
__decorate([
    core_1.Input(),
    __metadata("design:type", String)
], MarkedComponent.prototype, "content", void 0);
MarkedComponent = __decorate([
    core_1.Component({
        selector: 'marked',
        template: "<div class=\"mark_body\" [innerHTML]=\"content\"></div>",
        styleUrls: ['app/marked/marked.css'],
        changeDetection: core_1.ChangeDetectionStrategy.OnPush,
        encapsulation: core_1.ViewEncapsulation.Native,
    }),
    __metadata("design:paramtypes", [])
], MarkedComponent);
exports.MarkedComponent = MarkedComponent;
//# sourceMappingURL=marked.component.js.map