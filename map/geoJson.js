"use strict";
(function (global, factory) {
    global.Geo = factory();
})(this, function () {
    const isUef = (v) => v === undefined;
    const fixed = (v) => (v * 1) | 0;
    const ceil = Math.ceil;
    let eventIdx = 0;
    const eventCache = new Array;
    class Canvas {
        constructor(width, height) {
            if (!(isUef(width) || isUef(height))) {
                this.getCanvas(width, height);
            }
        }
        getCanvas(width, height) {
            this.width = width;
            this.height = height;
            let canvas = this.canvas = createNewCanvas(width, height);
            let ctx = this.ctx = canvas.getContext('2d');
            ctx.strokeStyle = '#333';
            return canvas;
        }
    }
    var cacheMap = new WeakMap;
    class Geo extends Canvas {
        constructor(option) {
            let { width, height, data, } = option;
            super(width, height);
            this.multiple = 1;
            this.x = { max: -Infinity, min: Infinity };
            this.y = { max: -Infinity, min: Infinity };
            this.children = [];
            cacheMap.set(this, data);
        }
        draw() {
            let { children, width, height, } = this;
            let ctx = this.ctx;
            let canvas = this.canvas;
            let data = cacheMap.get(this);
            let cacheX = cacheMaxAndMin();
            let cacheY = cacheMaxAndMin();
            for (let feature of data.features) {
                let area = new Trunk(feature);
                children.push(area);
                cacheX(area.x.max);
                cacheX(area.x.min);
                cacheY(area.y.max);
                cacheY(area.y.min);
            }
            let x = this.x = cacheX();
            let y = this.y = cacheY();
            let mt = this.multiple = multiple(x, y, width, height);
            ctx.translate(-x.min * mt, -y.min * mt);
            for (let area of children) {
                area.draw(mt);
                let x = area.startPosition[0] * mt;
                let y = area.startPosition[1] * mt;
                ctx.drawImage(area.canvas, x, y);
            }
            canvas.style.transform = 'scaleY(-1)';
        }
        on(type, handler) {
            if (typeof handler != 'function')
                throw new Error('Handler must be declare');
            var { canvas, multiple: mt, x, y, children } = this;
            var startPos = [x.min * mt, y.min * mt];
            var bindHandler = throttle(function (e) {
                var offsetX = e.offsetX;
                var offsetY = e.offsetY;
                var x = (offsetX + startPos[0]) / mt;
                var y = (offsetY + startPos[1]) / mt;
                handler(eventExtends(e, {
                    coordinate: [x, y],
                    children: children
                }));
            });
            canvas.addEventListener(type, bindHandler);
            eventCache[eventIdx] = {
                type,
                handler: bindHandler
            };
            return eventIdx++;
        }
        off(idx) {
            var { type, handler } = eventCache[idx];
            delete eventCache[idx];
            this.canvas.removeEventListener(type, handler);
        }
    }
    function eventExtends(e, obj) {
        for (var i in obj) {
            e[i] = obj[i];
        }
        return e;
    }
    function multiple(x, y, w, h) {
        let mt = Math.min(w / (x.max - x.min), h / (y.max - y.min));
        return fixed(mt * 10) / 10;
    }
    class Trunk extends Canvas {
        constructor(feature) {
            super();
            this.feature = feature;
            this.multiple = 1;
            this.startPosition = [0, 0];
            let cacheX = cacheMaxAndMin();
            let cacheY = cacheMaxAndMin();
            let geometry = feature.geometry;
            this.type = geometry.type;
            if (geometry.type == 'MultiPolygon') {
                let data = geometry.coordinates;
                for (let i of data) {
                    for (let j of i) {
                        for (let n of j) {
                            cacheX(n[0]);
                            cacheY(n[1]);
                        }
                    }
                }
            }
            else {
                console.log(geometry.type);
            }
            this.x = cacheX();
            this.y = cacheY();
        }
        draw(width, height) {
            var { x, y, feature, type } = this;
            var mt;
            if (!height) {
                mt = this.multiple = width;
                width = ceil((this.x.max - this.x.min) * mt);
                height = ceil((this.y.max - this.y.min) * mt);
            }
            else {
                mt = this.multiple = multiple(x, y, width, height);
            }
            this.startPosition = [x.min, y.min];
            var canvas = this.getCanvas(width, height);
            var ctx = canvas.getContext('2d');
            var start = [-x.min * mt, -y.min * mt];
            if (type == 'MultiPolygon') {
                var data = feature.geometry.coordinates;
                drawMultiPolygon(ctx, data, mt, start);
            }
            else {
                console.log(type);
            }
        }
        isContent(point) {
            var { x, y } = this;
            if (x.max < point[0] || x.min > point[0] || y.max < point[1] || y.min > point[1])
                return false;
            var isContent = false;
            var rowFn = slope(point, [point[0] + 1, point[1]]);
            var columnFn = slope(point, [point[0], point[1] + 1]);
            this.filter(function (array, _break) {
                for (let i of array) {
                    let leftNum = 0, rightNum = 0;
                    for (let j = 0, len = i.length; j < len - 1; j++) {
                        if (rowFn(i[j]) != rowFn(i[j + 1])) {
                            if (columnFn(i[j]) >= 0)
                                rightNum++;
                            else
                                leftNum++;
                        }
                    }
                    if (leftNum % 2 == 1 && rightNum % 2 == 1) {
                        isContent = true;
                        return _break;
                    }
                }
            });
            return isContent;
        }
        filter(fn) {
            var cache = [];
            let _break = {};
            for (var i of this.feature.geometry.coordinates) {
                var _return = fn(i, _break);
                if (_return === _break)
                    break;
                else if (!!_return == true)
                    cache.push(i);
            }
            return cache;
        }
    }
    function slope([x1, y1], [x2, y2]) {
        return function ([x, y]) {
            var testY = (x - x1) / (x2 - x1) * (y2 - y1) + y1;
            return testY > y ? 1 : testY < y ? -1 : 0;
        };
    }
    function drawMultiPolygon(ctx, data, mt = 1, start) {
        ctx.translate(...start);
        for (let i of data) {
            for (let j of i) {
                lineFormTo(ctx, j, mt);
            }
        }
    }
    function cacheMaxAndMin() {
        var cache = { max: -Infinity, min: Infinity };
        return function (value) {
            if (value) {
                if (value > cache.max)
                    cache.max = value;
                if (value < cache.min)
                    cache.min = value;
            }
            return cache;
        };
    }
    function lineFormTo(ctx, arr, mt) {
        arr = times(arr, mt);
        ctx.beginPath();
        ctx.moveTo(...arr[0]);
        for (let i in arr) {
            let [x, y] = arr[i];
            x = fixed(x) + .5;
            y = fixed(y) + .5;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.closePath();
    }
    function times(arr, times) {
        return arr.map(v => {
            return [v[0] * times, v[1] * times];
        });
    }
    function createNewCanvas(w, h) {
        let canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
    }
    function throttle(fn) {
        let queue = [];
        const req = window.requestAnimationFrame;
        return function (...arg) {
            if (queue.length === 0) {
                req(() => {
                    if (queue.length) {
                        fn.apply(this, queue.pop());
                        queue = [];
                    }
                });
            }
            ;
            queue.push(arg);
        };
    }
    ;
    return Geo;
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VvSnNvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdlb0pzb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLENBQUMsVUFBVSxNQUFXLEVBQUUsT0FBaUI7SUFDdkMsTUFBTSxDQUFDLEdBQUcsR0FBRyxPQUFPLEVBQUUsQ0FBQztBQUN6QixDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUU7SUFxR1AsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUM7SUFDMUMsTUFBTSxLQUFLLEdBQUcsQ0FBQyxDQUFrQixFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQVcsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDNUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztJQUN2QixJQUFJLFFBQVEsR0FBRyxDQUFDLENBQUM7SUFDakIsTUFBTSxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUM7SUFRN0IsTUFBTSxNQUFNO1FBS1YsWUFBWSxLQUFjLEVBQUUsTUFBZTtZQUN6QyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUU7Z0JBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBZSxFQUFFLE1BQWdCLENBQUMsQ0FBQzthQUNuRDtRQUNILENBQUM7UUFFRCxTQUFTLENBQUMsS0FBYSxFQUFFLE1BQWM7WUFDckMsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7WUFDbkIsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFFckIsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sR0FBRyxlQUFlLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzFELElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQTZCLENB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Q0FBQyxDQUFDLENBQUM7YUFDSjtZQUFBLENBQUM7WUFDRixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQ2pCLENBQUMsQ0FBQTtJQUNILENBQUM7SUFBQSxDQUFDO0lBRUYsT0FBTyxHQUFHLENBQUE7QUFDWixDQUFDLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiAoZ2xvYmFsOiBhbnksIGZhY3Rvcnk6IEZ1bmN0aW9uKSB7XHJcbiAgZ2xvYmFsLkdlbyA9IGZhY3RvcnkoKTtcclxufSkodGhpcywgZnVuY3Rpb24gKCk6IEZ1bmN0aW9uIHtcclxuXHJcblxyXG5cclxuICAvL2ludGVyZmFjZSBkZWNsYXJlXHJcbiAgaW50ZXJmYWNlIEdlb0pzb24ge1xyXG4gICAgdHlwZTogJ0ZlYXR1cmVDb2xsZWN0aW9uJ1xyXG4gICAgZmVhdHVyZXM6IEFycmF5PEZlYXR1cmU+XHJcbiAgfVxyXG5cclxuXHJcbiAgaW50ZXJmYWNlIEZlYXR1cmUge1xyXG4gICAgZ2VvbWV0cnk6IFBvbHlnb24gfCBNdWx0aVBvbHlnb24gfCBNdWx0aUxpbmVTdHJpbmcgfCBMaW5lU3RyaW5nIHwgTXVsdGlQb2ludCB8IFBvaW50XHJcbiAgICBwcm9wZXJ0aWVzOiBQcm9wZXJ0aWVzXHJcbiAgICB0eXBlOiAnRmVhdHVyZSdcclxuICB9XHJcblxyXG5cclxuICBpbnRlcmZhY2UgUHJvcGVydGllcyB7XHJcbiAgICBhY3JvdXRlczogQXJyYXk8bnVtYmVyPlxyXG4gICAgYWRjaGFyOiBhbnksXHJcbiAgICBhZGNvZGU6IHN0cmluZ1xyXG4gICAgY2VudGVyOiBbbnVtYmVyLCBudW1iZXJdXHJcbiAgICBjZW50cm9pZDogQXJyYXk8bnVtYmVyPlxyXG4gICAgY2hpbGRyZW5OdW06IG51bWJlciB8IHN0cmluZ1xyXG4gICAgbGV2ZWw6IHN0cmluZ1xyXG4gICAgbmFtZTogc3RyaW5nXHJcbiAgICBwYXJlbnQ6IHtcclxuICAgICAgYWRjb2RlOiBudW1iZXIgfCBzdHJpbmdcclxuICAgIH0sXHJcbiAgICBzdWJGZWF0dXJlSW5kZXg6IG51bWJlclxyXG4gIH1cclxuXHJcblxyXG4gIC8v54K5IOS4gOe7tFxyXG4gIGludGVyZmFjZSBQb2ludCB7XHJcbiAgICB0eXBlOiAnUG9pbnQnXHJcbiAgICBjb29yZGluYXRlczogW251bWJlciwgbnVtYmVyXVxyXG4gIH1cclxuXHJcblxyXG5cclxuICAvL+WkmueCuSDkuoznu7RcclxuICBpbnRlcmZhY2UgTXVsdGlQb2ludCB7XHJcbiAgICB0eXBlOiAnTXVsdGlQb2x5Z29uJ1xyXG4gICAgY29vcmRpbmF0ZXM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+XHJcbiAgfVxyXG5cclxuXHJcbiAgLy/nur8g5LqM57u0XHJcbiAgaW50ZXJmYWNlIExpbmVTdHJpbmcge1xyXG4gICAgdHlwZTogJ0xpbmVTdHJpbmcnLFxyXG4gICAgY29vcmRpbmF0ZXM6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+XHJcbiAgfVxyXG5cclxuXHJcbiAgLy/lpJrnur8g5LiJ57u05pWw57uEXHJcbiAgaW50ZXJmYWNlIE11bHRpTGluZVN0cmluZyB7XHJcbiAgICB0eXBlOiAnTXVsdGlMaW5lU3RyaW5nJyxcclxuICAgICAgY29vcmRpbmF0ZXM6IEFycmF5PEFycmF5PFtudW1iZXIsIG51bWJlcl0+PlxyXG4gIH1cclxuXHJcblxyXG4gIC8v5aSa6L655b2iIOS4iee7tOaVsOe7hFxyXG4gIGludGVyZmFjZSBQb2x5Z29uIHtcclxuICAgIHR5cGU6ICdQb2x5Z29uJyxcclxuICAgIGNvb3JkaW5hdGVzOiBBcnJheTxBcnJheTxbbnVtYmVyLCBudW1iZXJdPj5cclxuICB9XHJcblxyXG5cclxuICAvL+Wkmi3lpJrovrnlvaIg5Zub57u05pWw57uEXHJcbiAgaW50ZXJmYWNlIE11bHRpUG9seWdvbiB7XHJcbiAgICB0eXBlOiAnTXVsdGlQb2x5Z29uJyxcclxuICAgIGNvb3JkaW5hdGVzOiBBcnJheTxBcnJheTxBcnJheTxbbnVtYmVyLCBudW1iZXJdPj4+XHJcbiAgfVxyXG5cclxuXHJcbiAgLy/pm4blkIhcclxuICBpbnRlcmZhY2UgR2VvbWV0cnlDb2xsZWN0aW9uIHtcclxuICAgIHR5cGU6ICdHZW9tZXRyeUNvbGxlY3Rpb24nLFxyXG4gICAgZ2VvbWV0cmllczogQXJyYXk8UG9seWdvbiB8IE11bHRpUG9seWdvbiB8IE11bHRpTGluZVN0cmluZyB8IExpbmVTdHJpbmcgfCBNdWx0aVBvaW50IHwgUG9pbnQ+XHJcbiAgfVxyXG5cclxuXHJcbiAgaW50ZXJmYWNlIE1heEFuZE1pbiB7XHJcbiAgICBtYXg6IG51bWJlcixcclxuICAgIG1pbjogbnVtYmVyLFxyXG4gIH1cclxuXHJcblxyXG4gIGludGVyZmFjZSBfTW91c2VFdmVudCBleHRlbmRzIE1vdXNlRXZlbnQge1xyXG4gICAgY29vcmRpbmF0ZT86IFtudW1iZXIsIG51bWJlcl0sXHJcbiAgICBjaGlsZHJlbj86IEFycmF5PFRydW5rPixcclxuICAgIFt2OiBzdHJpbmddOiBhbnlcclxuICB9XHJcbiAgLy9pbnRlcmZhY2UgZGVjbGFyZSBlbmRcclxuXHJcblxyXG5cclxuXHJcblxyXG4gIGNvbnN0IGlzVWVmID0gKHY6IGFueSkgPT4gdiA9PT0gdW5kZWZpbmVkO1xyXG4gIGNvbnN0IGZpeGVkID0gKHY6IG51bWJlciB8IHN0cmluZykgPT4gKHYgYXMgbnVtYmVyICogMSkgfCAwO1xyXG4gIGNvbnN0IGNlaWwgPSBNYXRoLmNlaWw7XHJcbiAgbGV0IGV2ZW50SWR4ID0gMDtcclxuICBjb25zdCBldmVudENhY2hlID0gbmV3IEFycmF5O1xyXG5cclxuXHJcblxyXG5cclxuICAvKipcclxuICAgKiDmj5Dlj5bpgJrnlKjnmoTmianlsZXlr7nosaFcclxuICAgKi9cclxuICBjbGFzcyBDYW52YXMge1xyXG4gICAgY2FudmFzPzogSFRNTENhbnZhc0VsZW1lbnQ7XHJcbiAgICBjdHg/OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICB3aWR0aD86IG51bWJlcjtcclxuICAgIGhlaWdodD86IG51bWJlcjtcclxuICAgIGNvbnN0cnVjdG9yKHdpZHRoPzogbnVtYmVyLCBoZWlnaHQ/OiBudW1iZXIpIHtcclxuICAgICAgaWYgKCEoaXNVZWYod2lkdGgpIHx8IGlzVWVmKGhlaWdodCkpKSB7XHJcbiAgICAgICAgdGhpcy5nZXRDYW52YXMod2lkdGggYXMgbnVtYmVyLCBoZWlnaHQgYXMgbnVtYmVyKTtcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGdldENhbnZhcyh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IEhUTUxDYW52YXNFbGVtZW50IHtcclxuICAgICAgdGhpcy53aWR0aCA9IHdpZHRoO1xyXG4gICAgICB0aGlzLmhlaWdodCA9IGhlaWdodDtcclxuXHJcbiAgICAgIGxldCBjYW52YXMgPSB0aGlzLmNhbnZhcyA9IGNyZWF0ZU5ld0NhbnZhcyh3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgbGV0IGN0eCA9IHRoaXMuY3R4ID0gY2FudmFzLmdldENvbnRleHQoJzJkJykgYXMgQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xyXG4gICAgICBjdHguc3Ryb2tlU3R5bGUgPSAnIzMzMyc7XHJcbiAgICAgIHJldHVybiBjYW52YXNcclxuICAgIH1cclxuICB9XHJcblxyXG5cclxuICAvLyB3ZWFrTWFwIGNhY2hlIEdlby5kYXRhIFtHZW8sR2VvLmRhdGFdO1xyXG4gIHZhciBjYWNoZU1hcDogV2Vha01hcDxHZW8sIGFueT4gPSBuZXcgV2Vha01hcDtcclxuXHJcblxyXG5cclxuXHJcbiAgLy9tYWluXHJcbiAgY2xhc3MgR2VvIGV4dGVuZHMgQ2FudmFzIHtcclxuICAgIGNoaWxkcmVuOiBBcnJheTxUcnVuaz47Ly/miYDlsZ7lrZDpm4ZcclxuICAgIG11bHRpcGxlOiBudW1iZXI7Ly/mlL7lpKflgI3njodcclxuICAgIHg6IE1heEFuZE1pbjsvL3jmnIDlpKfmnIDlsI/ogqJcclxuICAgIHk6IE1heEFuZE1pbjsvL3nmnIDlpKfmnIDlsI/ogqJcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihvcHRpb246IHtcclxuICAgICAgd2lkdGg6IG51bWJlcixcclxuICAgICAgaGVpZ2h0OiBudW1iZXIsXHJcbiAgICAgIGRhdGE6IEdlb0pzb24sXHJcbiAgICAgIHNjYWxlOiBudW1iZXJcclxuICAgIH0pIHtcclxuICAgICAgbGV0IHtcclxuICAgICAgICB3aWR0aCxcclxuICAgICAgICBoZWlnaHQsXHJcbiAgICAgICAgZGF0YSxcclxuICAgICAgfSA9IG9wdGlvbjtcclxuICAgICAgc3VwZXIod2lkdGgsIGhlaWdodCk7XHJcbiAgICAgIHRoaXMubXVsdGlwbGUgPSAxO1xyXG4gICAgICB0aGlzLnggPSB7IG1heDogLUluZmluaXR5LCBtaW46IEluZmluaXR5IH07XHJcbiAgICAgIHRoaXMueSA9IHsgbWF4OiAtSW5maW5pdHksIG1pbjogSW5maW5pdHkgfTtcclxuICAgICAgdGhpcy5jaGlsZHJlbiA9IFtdO1xyXG4gICAgICBjYWNoZU1hcC5zZXQodGhpcywgZGF0YSk7XHJcbiAgICB9XHJcblxyXG5cclxuXHJcbiAgICBkcmF3KCkge1xyXG4gICAgICBsZXQgeyBjaGlsZHJlbiwgd2lkdGgsIGhlaWdodCwgfSA9IHRoaXM7XHJcbiAgICAgIGxldCBjdHggPSB0aGlzLmN0eCBhcyBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQ7XHJcbiAgICAgIGxldCBjYW52YXMgPSB0aGlzLmNhbnZhcyBhcyBIVE1MQ2FudmFzRWxlbWVudDtcclxuICAgICAgbGV0IGRhdGEgPSBjYWNoZU1hcC5nZXQodGhpcyk7XHJcblxyXG4gICAgICBsZXQgY2FjaGVYID0gY2FjaGVNYXhBbmRNaW4oKTtcclxuICAgICAgbGV0IGNhY2hlWSA9IGNhY2hlTWF4QW5kTWluKCk7XHJcbiAgICAgIGZvciAobGV0IGZlYXR1cmUgb2YgZGF0YS5mZWF0dXJlcykge1xyXG4gICAgICAgIGxldCBhcmVhOiBUcnVuayA9IG5ldyBUcnVuayhmZWF0dXJlKTtcclxuICAgICAgICBjaGlsZHJlbi5wdXNoKGFyZWEpO1xyXG4gICAgICAgIGNhY2hlWChhcmVhLngubWF4KTtcclxuICAgICAgICBjYWNoZVgoYXJlYS54Lm1pbik7XHJcbiAgICAgICAgY2FjaGVZKGFyZWEueS5tYXgpO1xyXG4gICAgICAgIGNhY2hlWShhcmVhLnkubWluKTtcclxuICAgICAgfVxyXG5cclxuXHJcbiAgICAgIGxldCB4ID0gdGhpcy54ID0gY2FjaGVYKCk7XHJcbiAgICAgIGxldCB5ID0gdGhpcy55ID0gY2FjaGVZKCk7XHJcbiAgICAgIGxldCBtdCA9IHRoaXMubXVsdGlwbGUgPSBtdWx0aXBsZSh4LCB5LCB3aWR0aCBhcyBudW1iZXIsIGhlaWdodCBhcyBudW1iZXIpO1xyXG4gICAgICBjdHgudHJhbnNsYXRlKC14Lm1pbiAqIG10LCAteS5taW4gKiBtdCk7XHJcbiAgICAgIGZvciAobGV0IGFyZWEgb2YgY2hpbGRyZW4pIHtcclxuICAgICAgICBhcmVhLmRyYXcobXQpO1xyXG4gICAgICAgIGxldCB4ID0gYXJlYS5zdGFydFBvc2l0aW9uWzBdICogbXQ7XHJcbiAgICAgICAgbGV0IHkgPSBhcmVhLnN0YXJ0UG9zaXRpb25bMV0gKiBtdFxyXG4gICAgICAgIGN0eC5kcmF3SW1hZ2UoYXJlYS5jYW52YXMgYXMgSFRNTENhbnZhc0VsZW1lbnQsIHgsIHkpO1xyXG4gICAgICB9XHJcbiAgICAgIGNhbnZhcy5zdHlsZS50cmFuc2Zvcm0gPSAnc2NhbGVZKC0xKSdcclxuICAgIH1cclxuXHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiDkuovku7bnm5HlkKwgXHJcbiAgICAgKiDmt7vliqBcclxuICAgICAqIGNvb3JkaW5hdGU6W251bWJlcixudW1iZXJdIOWdkOagh1xyXG4gICAgICogY2hpbGRyZW46QXJyYXk8VHJ1bms+IOS4i+WxnuWtkOmbhlxyXG4gICAgICog6IezZXZlbnTlr7nosaFcclxuICAgICAqIEBwYXJhbSB0eXBlIOexu+Wei1xyXG4gICAgICogQHBhcmFtIGhhbmRsZXIg5Ye95pWwXHJcbiAgICAgKi9cclxuICAgIG9uKHR5cGU6IHN0cmluZywgaGFuZGxlcjogRnVuY3Rpb24pIHtcclxuICAgICAgaWYgKHR5cGVvZiBoYW5kbGVyICE9ICdmdW5jdGlvbicpIHRocm93IG5ldyBFcnJvcignSGFuZGxlciBtdXN0IGJlIGRlY2xhcmUnKTtcclxuXHJcbiAgICAgIHZhciB7IGNhbnZhcywgbXVsdGlwbGU6IG10LCB4LCB5LCBjaGlsZHJlbiB9ID0gdGhpcztcclxuICAgICAgdmFyIHN0YXJ0UG9zID0gW3gubWluICogbXQsIHkubWluICogbXRdO1xyXG5cclxuICAgICAgLy9iaW5kIG9yIG9mZiBmdW5jdGlvbiBcclxuICAgICAgdmFyIGJpbmRIYW5kbGVyID0gdGhyb3R0bGUoZnVuY3Rpb24gKGU6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICB2YXIgb2Zmc2V0WCA9IGUub2Zmc2V0WDtcclxuICAgICAgICB2YXIgb2Zmc2V0WSA9IGUub2Zmc2V0WTtcclxuICAgICAgICB2YXIgeCA9IChvZmZzZXRYICsgc3RhcnRQb3NbMF0pIC8gbXQ7XHJcbiAgICAgICAgdmFyIHkgPSAob2Zmc2V0WSArIHN0YXJ0UG9zWzFdKSAvIG10O1xyXG4gICAgICAgIGhhbmRsZXIoZXZlbnRFeHRlbmRzKGUsIHtcclxuICAgICAgICAgIGNvb3JkaW5hdGU6IFt4LCB5XSxcclxuICAgICAgICAgIGNoaWxkcmVuOiBjaGlsZHJlblxyXG4gICAgICAgIH0pKTtcclxuICAgICAgfSkgYXMgRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdDtcclxuXHJcbiAgICAgIC8vYmluZFxyXG4gICAgICAoY2FudmFzIGFzIEhUTUxDYW52YXNFbGVtZW50KS5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGJpbmRIYW5kbGVyKTtcclxuXHJcbiAgICAgIC8vYWRkIG9mZiBDYWNoZVxyXG4gICAgICBldmVudENhY2hlW2V2ZW50SWR4XSA9IHtcclxuICAgICAgICB0eXBlLFxyXG4gICAgICAgIGhhbmRsZXI6IGJpbmRIYW5kbGVyXHJcbiAgICAgIH07XHJcblxyXG4gICAgICByZXR1cm4gZXZlbnRJZHgrKztcclxuICAgIH1cclxuXHJcbiAgICBvZmYoaWR4OiBudW1iZXIpIHtcclxuICAgICAgdmFyIHsgdHlwZSwgaGFuZGxlciB9ID0gZXZlbnRDYWNoZVtpZHhdO1xyXG4gICAgICBkZWxldGUgZXZlbnRDYWNoZVtpZHhdO1xyXG4gICAgICAodGhpcy5jYW52YXMgYXMgSFRNTENhbnZhc0VsZW1lbnQpLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlcik7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvL+aJqeWxlWV2ZW505a+56LGhXHJcbiAgZnVuY3Rpb24gZXZlbnRFeHRlbmRzKGU6IF9Nb3VzZUV2ZW50LCBvYmo6IGFueSkge1xyXG4gICAgZm9yICh2YXIgaSBpbiBvYmopIHtcclxuICAgICAgZVtpXSA9IG9ialtpXVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGVcclxuICB9XHJcblxyXG5cclxuXHJcbiAgLy/orqHnrpflj6/og73nmoTmnIDlpKfmlL7lpKflgI3mlbBcclxuICBmdW5jdGlvbiBtdWx0aXBsZSh4OiBNYXhBbmRNaW4sIHk6IE1heEFuZE1pbiwgdzogbnVtYmVyLCBoOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgbGV0IG10ID0gTWF0aC5taW4odyAvICh4Lm1heCAtIHgubWluKSwgaCAvICh5Lm1heCAtIHkubWluKSk7XHJcbiAgICByZXR1cm4gZml4ZWQobXQgKiAxMCkgLyAxMDtcclxuICB9XHJcblxyXG5cclxuXHJcblxyXG4gIC8qIFxyXG4gIFxyXG4gICovXHJcblxyXG5cclxuXHJcbiAgLy/lrZDpm4ZcclxuICBjbGFzcyBUcnVuayBleHRlbmRzIENhbnZhcyB7XHJcbiAgICB4OiBNYXhBbmRNaW47Ly9455qE5pyA5aSn5pyA5bCP5YC8XHJcbiAgICB5OiBNYXhBbmRNaW47Ly9555qE5pyA5aSn5pyA5bCP5YC8XHJcbiAgICB0eXBlOiBzdHJpbmc7Ly/nsbvlnotcclxuICAgIG11bHRpcGxlOiBudW1iZXI7Ly/mlL7lpKflgI3mlbBcclxuICAgIGZlYXR1cmU6IEZlYXR1cmU7Ly/mlbDmja5cclxuICAgIHN0YXJ0UG9zaXRpb246IFtudW1iZXIsIG51bWJlcl07Ly/lvIDlp4vngrlcclxuXHJcbiAgICBjb25zdHJ1Y3RvcihmZWF0dXJlOiBGZWF0dXJlKSB7XHJcbiAgICAgIHN1cGVyKCk7XHJcbiAgICAgIHRoaXMuZmVhdHVyZSA9IGZlYXR1cmU7XHJcbiAgICAgIHRoaXMubXVsdGlwbGUgPSAxO1xyXG4gICAgICB0aGlzLnN0YXJ0UG9zaXRpb24gPSBbMCwgMF07XHJcbiAgICAgIGxldCBjYWNoZVggPSBjYWNoZU1heEFuZE1pbigpO1xyXG4gICAgICBsZXQgY2FjaGVZID0gY2FjaGVNYXhBbmRNaW4oKTtcclxuXHJcbiAgICAgIGxldCBnZW9tZXRyeSA9IGZlYXR1cmUuZ2VvbWV0cnk7XHJcbiAgICAgIHRoaXMudHlwZSA9IGdlb21ldHJ5LnR5cGU7XHJcbiAgICAgIGlmIChnZW9tZXRyeS50eXBlID09ICdNdWx0aVBvbHlnb24nKSB7XHJcbiAgICAgICAgbGV0IGRhdGEgPSAoZ2VvbWV0cnkgYXMgTXVsdGlQb2x5Z29uKS5jb29yZGluYXRlcztcclxuICAgICAgICAvL+mBjeWOhue7tOW6pjtcclxuICAgICAgICBmb3IgKGxldCBpIG9mIGRhdGEpIHtcclxuICAgICAgICAgIGZvciAobGV0IGogb2YgaSkge1xyXG4gICAgICAgICAgICBmb3IgKGxldCBuIG9mIGopIHtcclxuICAgICAgICAgICAgICBjYWNoZVgoblswXSk7XHJcbiAgICAgICAgICAgICAgY2FjaGVZKG5bMV0pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGdlb21ldHJ5LnR5cGUpO1xyXG4gICAgICB9XHJcblxyXG5cclxuICAgICAgdGhpcy54ID0gY2FjaGVYKCk7XHJcbiAgICAgIHRoaXMueSA9IGNhY2hlWSgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICog5YaZ5YWl5pS+5aSn5YCN5pWw5oiW6ICF5a695bqm6auY5bqmLOiHquWKqOiuoeeul1xyXG4gICAgICogQHBhcmFtIHdpZHRoIOWAjeaVsOaIluiAheWuveW6plxyXG4gICAgICogQHBhcmFtIGhlaWdodCDlrr3luqZcclxuICAgICAqL1xyXG4gICAgZHJhdyh3aWR0aDogbnVtYmVyLCBoZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgdmFyIHsgeCwgeSwgZmVhdHVyZSwgdHlwZSB9ID0gdGhpcztcclxuICAgICAgdmFyIG10O1xyXG4gICAgICBpZiAoIWhlaWdodCkge1xyXG4gICAgICAgIG10ID0gdGhpcy5tdWx0aXBsZSA9IHdpZHRoO1xyXG4gICAgICAgIHdpZHRoID0gY2VpbCgodGhpcy54Lm1heCAtIHRoaXMueC5taW4pICogbXQpO1xyXG4gICAgICAgIGhlaWdodCA9IGNlaWwoKHRoaXMueS5tYXggLSB0aGlzLnkubWluKSAqIG10KTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBtdCA9IHRoaXMubXVsdGlwbGUgPSBtdWx0aXBsZSh4LCB5LCB3aWR0aCwgaGVpZ2h0KTtcclxuICAgICAgfVxyXG5cclxuXHJcbiAgICAgIHRoaXMuc3RhcnRQb3NpdGlvbiA9IFsoeCBhcyBNYXhBbmRNaW4pLm1pbiwgKHkgYXMgTWF4QW5kTWluKS5taW5dO1xyXG5cclxuICAgICAgdmFyIGNhbnZhcyA9IHRoaXMuZ2V0Q2FudmFzKHdpZHRoLCBoZWlnaHQpO1xyXG5cclxuICAgICAgdmFyIGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpIGFzIENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRDtcclxuICAgICAgdmFyIHN0YXJ0OiBbbnVtYmVyLCBudW1iZXJdID0gWy14Lm1pbiAqIG10LCAteS5taW4gKiBtdF07XHJcblxyXG5cclxuICAgICAgaWYgKHR5cGUgPT0gJ011bHRpUG9seWdvbicpIHtcclxuICAgICAgICB2YXIgZGF0YSA9IChmZWF0dXJlLmdlb21ldHJ5IGFzIE11bHRpUG9seWdvbikuY29vcmRpbmF0ZXM7XHJcbiAgICAgICAgZHJhd011bHRpUG9seWdvbihjdHgsIGRhdGEsIG10LCBzdGFydCk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgY29uc29sZS5sb2codHlwZSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvL+eCueaYr+WQpuiiq+WMheWQq1xyXG4gICAgaXNDb250ZW50KHBvaW50OiBbbnVtYmVyLCBudW1iZXJdKTogYm9vbGVhbiB7XHJcbiAgICAgIHZhciB7IHgsIHkgfSA9IHRoaXM7XHJcbiAgICAgIGlmICh4Lm1heCA8IHBvaW50WzBdIHx8IHgubWluID4gcG9pbnRbMF0gfHwgeS5tYXggPCBwb2ludFsxXSB8fCB5Lm1pbiA+IHBvaW50WzFdKSByZXR1cm4gZmFsc2VcclxuXHJcblxyXG4gICAgICB2YXIgaXNDb250ZW50ID0gZmFsc2U7XHJcbiAgICAgIC8v5qOA5rWL5Zyo57qs57q/55qE5ZOq5LiA5L6nXHJcbiAgICAgIHZhciByb3dGbiA9IHNsb3BlKHBvaW50LCBbcG9pbnRbMF0gKyAxLCBwb2ludFsxXV0pO1xyXG4gICAgICAvL+ajgOa1i+WcqOe7j+e6v+eahOWTquS4gOS+p1xyXG4gICAgICB2YXIgY29sdW1uRm4gPSBzbG9wZShwb2ludCwgW3BvaW50WzBdLCBwb2ludFsxXSArIDFdKVxyXG5cclxuXHJcbiAgICAgIHRoaXMuZmlsdGVyKGZ1bmN0aW9uIChhcnJheTogYW55LCBfYnJlYWs6IGFueSkge1xyXG4gICAgICAgIGZvciAobGV0IGkgb2YgYXJyYXkpIHtcclxuICAgICAgICAgIGxldCBsZWZ0TnVtID0gMCwgcmlnaHROdW0gPSAwO1xyXG4gICAgICAgICAgZm9yIChsZXQgaiA9IDAsIGxlbiA9IGkubGVuZ3RoOyBqIDwgbGVuIC0gMTsgaisrKSB7XHJcbiAgICAgICAgICAgIC8v5Yik5pat5piv5ZCm55u45LqkXHJcbiAgICAgICAgICAgIGlmIChyb3dGbihpW2pdKSAhPSByb3dGbihpW2ogKyAxXSkpIHtcclxuICAgICAgICAgICAgICAvL+WIpOaWreWcqOW3puS+p+aIluiAheaYr+WPs+S+p1xyXG4gICAgICAgICAgICAgIGlmIChjb2x1bW5GbihpW2pdKSA+PSAwKSByaWdodE51bSsrO1xyXG4gICAgICAgICAgICAgIGVsc2UgbGVmdE51bSsrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy/lt6blj7PkuKTkvqfkuqTngrnnmoTmlbDph4/lhajkuLrlpYfmlbAs5YiZ5Yik5a6a5Li65Zyo5a655Zmo5YaF6YOoXHJcbiAgICAgICAgICBpZiAobGVmdE51bSAlIDIgPT0gMSAmJiByaWdodE51bSAlIDIgPT0gMSkge1xyXG4gICAgICAgICAgICBpc0NvbnRlbnQgPSB0cnVlO1xyXG4gICAgICAgICAgICByZXR1cm4gX2JyZWFrO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgICAgcmV0dXJuIGlzQ29udGVudDtcclxuICAgIH1cclxuXHJcbiAgICAvL+i/h+a7pFxyXG4gICAgZmlsdGVyKGZuOiBGdW5jdGlvbik6IEFycmF5PGFueT4ge1xyXG4gICAgICB2YXIgY2FjaGU6IEFycmF5PGFueT4gPSBbXVxyXG4gICAgICBsZXQgX2JyZWFrID0ge307XHJcbiAgICAgIGZvciAodmFyIGkgb2YgdGhpcy5mZWF0dXJlLmdlb21ldHJ5LmNvb3JkaW5hdGVzKSB7XHJcbiAgICAgICAgdmFyIF9yZXR1cm4gPSBmbihpLCBfYnJlYWspO1xyXG4gICAgICAgIGlmIChfcmV0dXJuID09PSBfYnJlYWspIGJyZWFrO1xyXG4gICAgICAgIGVsc2UgaWYgKCEhX3JldHVybiA9PSB0cnVlKSBjYWNoZS5wdXNoKGkpO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBjYWNoZVxyXG4gICAgfVxyXG4gIH1cclxuXHJcblxyXG4gIC8v55Sf5oiQ5LiA5Liq5pyJ5pa55ZCR55qE57q/5q61XHJcbiAgLy/mlrnlkJHkuLrotbflp4vngrnlkoznu4jmraLngrnnmoTov57nur87XHJcbiAgLy/liKTmlq3kuIDkuKrngrnlnKjnur/mrrXnmoTlt6bkvqfmiJbogIXlj7PkvqcsIOWPs+S+pzE75bem5L6nLTFcclxuICBmdW5jdGlvbiBzbG9wZShbeDEsIHkxXTogW251bWJlciwgbnVtYmVyXSwgW3gyLCB5Ml06IFtudW1iZXIsIG51bWJlcl0pOiBGdW5jdGlvbiB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKFt4LCB5XTogW251bWJlciwgbnVtYmVyXSk6IG51bWJlciB7XHJcbiAgICAgIHZhciB0ZXN0WSA9ICh4IC0geDEpIC8gKHgyIC0geDEpICogKHkyIC0geTEpICsgeTE7XHJcbiAgICAgIHJldHVybiB0ZXN0WSA+IHkgPyAxIDogdGVzdFkgPCB5ID8gLTEgOiAwXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuXHJcbiAgZnVuY3Rpb24gZHJhd011bHRpUG9seWdvbihjdHg6IENhbnZhc1JlbmRlcmluZ0NvbnRleHQyRCwgZGF0YTogW251bWJlciwgbnVtYmVyXVtdW11bXSwgbXQ6IG51bWJlciA9IDEsIHN0YXJ0OiBbbnVtYmVyLCBudW1iZXJdKSB7XHJcbiAgICBjdHgudHJhbnNsYXRlKC4uLnN0YXJ0KTtcclxuICAgIGZvciAobGV0IGkgb2YgZGF0YSkge1xyXG4gICAgICBmb3IgKGxldCBqIG9mIGkpIHtcclxuICAgICAgICBsaW5lRm9ybVRvKGN0eCwgaiwgbXQpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuXHJcbiAgLy/nvJPlrZjmnIDlpKflgLzlkozmnIDlsI/lgLxcclxuICBmdW5jdGlvbiBjYWNoZU1heEFuZE1pbigpIHtcclxuICAgIHZhciBjYWNoZTogTWF4QW5kTWluID0geyBtYXg6IC1JbmZpbml0eSwgbWluOiBJbmZpbml0eSB9XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKHZhbHVlPzogbnVtYmVyKTogTWF4QW5kTWluIHtcclxuICAgICAgaWYgKHZhbHVlKSB7XHJcbiAgICAgICAgaWYgKHZhbHVlID4gY2FjaGUubWF4KSBjYWNoZS5tYXggPSB2YWx1ZTtcclxuICAgICAgICBpZiAodmFsdWUgPCBjYWNoZS5taW4pIGNhY2hlLm1pbiA9IHZhbHVlO1xyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBjYWNoZVxyXG4gICAgfVxyXG4gIH1cclxuXHJcblxyXG4gIC8v54K55Yiw54K5LOaUvuWkp+WAjeaVsFxyXG4gIGZ1bmN0aW9uIGxpbmVGb3JtVG8oY3R4OiBDYW52YXNSZW5kZXJpbmdDb250ZXh0MkQsIGFycjogQXJyYXk8W251bWJlciwgbnVtYmVyXT4sIG10OiBudW1iZXIpIHtcclxuICAgIGFyciA9IHRpbWVzKGFyciwgbXQpO1xyXG4gICAgY3R4LmJlZ2luUGF0aCgpO1xyXG4gICAgY3R4Lm1vdmVUbyguLi5hcnJbMF0pO1xyXG4gICAgZm9yIChsZXQgaSBpbiBhcnIpIHtcclxuICAgICAgbGV0IFt4LCB5XSA9IGFycltpXTtcclxuICAgICAgeCA9IGZpeGVkKHgpICsgLjU7XHJcbiAgICAgIHkgPSBmaXhlZCh5KSArIC41XHJcbiAgICAgIGN0eC5saW5lVG8oeCwgeSlcclxuICAgIH1cclxuICAgIGN0eC5zdHJva2UoKTtcclxuICAgIGN0eC5jbG9zZVBhdGgoKTtcclxuICB9XHJcblxyXG5cclxuICAvL3RpbWVz5YCNXHJcbiAgZnVuY3Rpb24gdGltZXMoYXJyOiBBcnJheTxbbnVtYmVyLCBudW1iZXJdPiwgdGltZXM6IG51bWJlcik6IEFycmF5PFtudW1iZXIsIG51bWJlcl0+IHtcclxuICAgIHJldHVybiBhcnIubWFwKHYgPT4ge1xyXG4gICAgICByZXR1cm4gW3ZbMF0gKiB0aW1lcywgdlsxXSAqIHRpbWVzXTtcclxuICAgIH0pXHJcbiAgfVxyXG5cclxuXHJcblxyXG4gIC8v5Yib5bu6bmV3IGNhbnZhc1xyXG4gIGZ1bmN0aW9uIGNyZWF0ZU5ld0NhbnZhcyh3OiBudW1iZXIsIGg6IG51bWJlcik6IEhUTUxDYW52YXNFbGVtZW50IHtcclxuICAgIGxldCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgIGNhbnZhcy53aWR0aCA9IHc7XHJcbiAgICBjYW52YXMuaGVpZ2h0ID0gaDtcclxuICAgIHJldHVybiBjYW52YXM7XHJcbiAgfVxyXG5cclxuXHJcbiAgLy/oioLmtYFcclxuICBmdW5jdGlvbiB0aHJvdHRsZShmbjogRnVuY3Rpb24pOiBGdW5jdGlvbiB7XHJcbiAgICBsZXQgcXVldWU6IEFycmF5PGFueT4gPSBbXTsgLy/pmJ/liJdcclxuICAgIGNvbnN0IHJlcSA9IHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWU7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24gKHRoaXM6IGFueSwgLi4uYXJnOiBBcnJheTxhbnk+KSB7XHJcbiAgICAgIGlmIChxdWV1ZS5sZW5ndGggPT09IDApIHsgLy/pmJ/liJfkuLrnqbrml7Ys5Yib5bu65paw5bu26L+fXHJcbiAgICAgICAgcmVxKCgpID0+IHtcclxuICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcclxuICAgICAgICAgICAgZm4uYXBwbHkodGhpcywgcXVldWUucG9wKCkpOyAvL+acgOWQjuS4gOasoVxyXG4gICAgICAgICAgICBxdWV1ZSA9IFtdOyAvL+a4heepulxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9O1xyXG4gICAgICBxdWV1ZS5wdXNoKGFyZykgLy/liqDlhaXpmJ/liJdcclxuICAgIH1cclxuICB9O1xyXG5cclxuICByZXR1cm4gR2VvXHJcbn0pIl19