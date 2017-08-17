// define(["require", "exports"], function (require, exports) {
//     "use strict";
//     Object.defineProperty(exports, "__esModule", { value: true });
//     var Hello = (function () {
//         function Hello() {
//         }
//         return Hello;
//     }());
//     exports.Hello = Hello;
// });

define(["require", "exports", "./world-amd"], function (require, exports, world) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var Hello = (function () {
        function Hello() {
          this.world = new world.World();
        }
        return Hello;
    }());
    exports.Hello = Hello;
});
