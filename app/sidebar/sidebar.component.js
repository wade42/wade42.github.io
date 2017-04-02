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
var sidebar_service_1 = require("./sidebar.service");
var marked_1 = require("../marked/marked");
var posts_1 = require("./posts");
var SideBarComponent = (function () {
    function SideBarComponent(ref, service) {
        this.ref = ref;
        this.service = service;
        this.active = false;
        this.posts = posts_1.POSTS;
        this.md = new marked_1.Marked();
    }
    SideBarComponent.prototype.actived = function () {
        this.active = !this.active;
        console.dir(this.active);
    };
    SideBarComponent.prototype.getMd = function (event) {
        var _this = this;
        this.active = false;
        var mk = this.service.getMarkdown(event.target.dataset.url).subscribe(function (data) {
            _this.content = _this.md.marked(data._body);
            _this.ref.markForCheck();
        }, function (error) { return console.error(error); });
    };
    return SideBarComponent;
}());
SideBarComponent = __decorate([
    core_1.Component({
        selector: 'sidebar',
        templateUrl: '/app/sidebar/sidebar.html',
        styleUrls: ['app/sidebar/sidebar.css'],
        changeDetection: core_1.ChangeDetectionStrategy.OnPush,
        encapsulation: core_1.ViewEncapsulation.Native,
        providers: [sidebar_service_1.SideBarService]
    }),
    __metadata("design:paramtypes", [typeof (_a = typeof core_1.ChangeDetectorRef !== "undefined" && core_1.ChangeDetectorRef) === "function" && _a || Object, sidebar_service_1.SideBarService])
], SideBarComponent);
exports.SideBarComponent = SideBarComponent;
var _a;
//# sourceMappingURL=sidebar.component.js.map