(function (global: any, factory: Function) {
  global.Geo = factory();
})(this, function (): Function {



  //interface declare
  interface GeoJson {
    type: 'FeatureCollection'
    features: Array<Feature>
  }


  interface Feature {
    geometry: Polygon | MultiPolygon | MultiLineString | LineString | MultiPoint | Point
    properties: Properties
    type: 'Feature'
  }


  interface Properties {
    acroutes: Array<number>
    adchar: any,
    adcode: string
    center: [number, number]
    centroid: Array<number>
    childrenNum: number | string
    level: string
    name: string
    parent: {
      adcode: number | string
    },
    subFeatureIndex: number
  }


  //点 一维
  interface Point {
    type: 'Point'
    coordinates: [number, number]
  }



  //多点 二维
  interface MultiPoint {
    type: 'MultiPolygon'
    coordinates: Array<[number, number]>
  }


  //线 二维
  interface LineString {
    type: 'LineString',
    coordinates: Array<[number, number]>
  }


  //多线 三维数组
  interface MultiLineString {
    type: 'MultiLineString',
      coordinates: Array<Array<[number, number]>>
  }


  //多边形 三维数组
  interface Polygon {
    type: 'Polygon',
    coordinates: Array<Array<[number, number]>>
  }


  //多-多边形 四维数组
  interface MultiPolygon {
    type: 'MultiPolygon',
    coordinates: Array<Array<Array<[number, number]>>>
  }


  //集合
  interface GeometryCollection {
    type: 'GeometryCollection',
    geometries: Array<Polygon | MultiPolygon | MultiLineString | LineString | MultiPoint | Point>
  }


  interface MaxAndMin {
    max: number,
    min: number,
  }


  interface _MouseEvent extends MouseEvent {
    coordinate?: [number, number],
    children?: Array<Trunk>,
    [v: string]: any
  }
  //interface declare end





  const isUef = (v: any) => v === undefined;
  const fixed = (v: number | string) => (v as number * 1) | 0;
  const ceil = Math.ceil;
  let eventIdx = 0;
  const eventCache = new Array;




  /**
   * 提取通用的扩展对象
   */
  class Canvas {
    canvas?: HTMLCanvasElement;
    ctx?: CanvasRenderingContext2D;
    width?: number;
    height?: number;
    constructor(width?: number, height?: number) {
      if (!(isUef(width) || isUef(height))) {
        this.getCanvas(width as number, height as number);
      }
    }

    getCanvas(width: number, height: number): HTMLCanvasElement {
      this.width = width;
      this.height = height;

      let canvas = this.canvas = createNewCanvas(width, height);
      let ctx = this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.strokeStyle = '#333';
      return canvas
    }
  }


  // weakMap cache Geo.data [Geo,Geo.data];
  var cacheMap: WeakMap<Geo, any> = new WeakMap;




  //main
  class Geo extends Canvas {
    children: Array<Trunk>;//所属子集
    multiple: number;//放大倍率
    x: MaxAndMin;//x最大最小肢
    y: MaxAndMin;//y最大最小肢

    constructor(option: {
      width: number,
      height: number,
      data: GeoJson,
      scale: number
    }) {
      let {
        width,
        height,
        data,
      } = option;
      super(width, height);
      this.multiple = 1;
      this.x = { max: -Infinity, min: Infinity };
      this.y = { max: -Infinity, min: Infinity };
      this.children = [];
      cacheMap.set(this, data);
    }



    draw() {
      let { children, width, height, } = this;
      let ctx = this.ctx as CanvasRenderingContext2D;
      let canvas = this.canvas as HTMLCanvasElement;
      let data = cacheMap.get(this);

      let cacheX = cacheMaxAndMin();
      let cacheY = cacheMaxAndMin();
      for (let feature of data.features) {
        let area: Trunk = new Trunk(feature);
        children.push(area);
        cacheX(area.x.max);
        cacheX(area.x.min);
        cacheY(area.y.max);
        cacheY(area.y.min);
      }


      let x = this.x = cacheX();
      let y = this.y = cacheY();
      let mt = this.multiple = multiple(x, y, width as number, height as number);
      ctx.translate(-x.min * mt, -y.min * mt);
      for (let area of children) {
        area.draw(mt);
        let x = area.startPosition[0] * mt;
        let y = area.startPosition[1] * mt
        ctx.drawImage(area.canvas as HTMLCanvasElement, x, y);
      }
      canvas.style.transform = 'scaleY(-1)'
    }


    /**
     * 事件监听 
     * 添加
     * coordinate:[number,number] 坐标
     * children:Array<Trunk> 下属子集
     * 至event对象
     * @param type 类型
     * @param handler 函数
     */
    on(type: string, handler: Function) {
      if (typeof handler != 'function') throw new Error('Handler must be declare');

      var { canvas, multiple: mt, x, y, children } = this;
      var startPos = [x.min * mt, y.min * mt];

      //bind or off function 
      var bindHandler = throttle(function (e: MouseEvent) {
        var offsetX = e.offsetX;
        var offsetY = e.offsetY;
        var x = (offsetX + startPos[0]) / mt;
        var y = (offsetY + startPos[1]) / mt;
        handler(eventExtends(e, {
          coordinate: [x, y],
          children: children
        }));
      }) as EventListenerOrEventListenerObject;

      //bind
      (canvas as HTMLCanvasElement).addEventListener(type, bindHandler);

      //add off Cache
      eventCache[eventIdx] = {
        type,
        handler: bindHandler
      };

      return eventIdx++;
    }

    off(idx: number) {
      var { type, handler } = eventCache[idx];
      delete eventCache[idx];
      (this.canvas as HTMLCanvasElement).removeEventListener(type, handler);
    }
  }

  //扩展event对象
  function eventExtends(e: _MouseEvent, obj: any) {
    for (var i in obj) {
      e[i] = obj[i]
    }
    return e
  }



  //计算可能的最大放大倍数
  function multiple(x: MaxAndMin, y: MaxAndMin, w: number, h: number): number {
    let mt = Math.min(w / (x.max - x.min), h / (y.max - y.min));
    return fixed(mt * 10) / 10;
  }




  /* 
  
  */



  //子集
  class Trunk extends Canvas {
    x: MaxAndMin;//x的最大最小值
    y: MaxAndMin;//y的最大最小值
    type: string;//类型
    multiple: number;//放大倍数
    feature: Feature;//数据
    startPosition: [number, number];//开始点

    constructor(feature: Feature) {
      super();
      this.feature = feature;
      this.multiple = 1;
      this.startPosition = [0, 0];
      let cacheX = cacheMaxAndMin();
      let cacheY = cacheMaxAndMin();

      let geometry = feature.geometry;
      this.type = geometry.type;
      if (geometry.type == 'MultiPolygon') {
        let data = (geometry as MultiPolygon).coordinates;
        //遍历维度;
        for (let i of data) {
          for (let j of i) {
            for (let n of j) {
              cacheX(n[0]);
              cacheY(n[1])
            }
          }
        }

      } else {
        console.log(geometry.type);
      }


      this.x = cacheX();
      this.y = cacheY();
    }

    /**
     * 写入放大倍数或者宽度高度,自动计算
     * @param width 倍数或者宽度
     * @param height 宽度
     */
    draw(width: number, height?: number): void {
      var { x, y, feature, type } = this;
      var mt;
      if (!height) {
        mt = this.multiple = width;
        width = ceil((this.x.max - this.x.min) * mt);
        height = ceil((this.y.max - this.y.min) * mt);
      } else {
        mt = this.multiple = multiple(x, y, width, height);
      }


      this.startPosition = [(x as MaxAndMin).min, (y as MaxAndMin).min];

      var canvas = this.getCanvas(width, height);

      var ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      var start: [number, number] = [-x.min * mt, -y.min * mt];


      if (type == 'MultiPolygon') {
        var data = (feature.geometry as MultiPolygon).coordinates;
        drawMultiPolygon(ctx, data, mt, start);
      } else {
        console.log(type);
      }
    }

    //点是否被包含
    isContent(point: [number, number]): boolean {
      var { x, y } = this;
      if (x.max < point[0] || x.min > point[0] || y.max < point[1] || y.min > point[1]) return false


      var isContent = false;
      //检测在纬线的哪一侧
      var rowFn = slope(point, [point[0] + 1, point[1]]);
      //检测在经线的哪一侧
      var columnFn = slope(point, [point[0], point[1] + 1])


      this.filter(function (array: any, _break: any) {
        for (let i of array) {
          let leftNum = 0, rightNum = 0;
          for (let j = 0, len = i.length; j < len - 1; j++) {
            //判断是否相交
            if (rowFn(i[j]) != rowFn(i[j + 1])) {
              //判断在左侧或者是右侧
              if (columnFn(i[j]) >= 0) rightNum++;
              else leftNum++;
            }
          }

          //左右两侧交点的数量全为奇数,则判定为在容器内部
          if (leftNum % 2 == 1 && rightNum % 2 == 1) {
            isContent = true;
            return _break;
          }
        }
      })
      return isContent;
    }

    //过滤
    filter(fn: Function): Array<any> {
      var cache: Array<any> = []
      let _break = {};
      for (var i of this.feature.geometry.coordinates) {
        var _return = fn(i, _break);
        if (_return === _break) break;
        else if (!!_return == true) cache.push(i);
      }
      return cache
    }
  }


  //生成一个有方向的线段
  //方向为起始点和终止点的连线;
  //判断一个点在线段的左侧或者右侧, 右侧1;左侧-1
  function slope([x1, y1]: [number, number], [x2, y2]: [number, number]): Function {
    return function ([x, y]: [number, number]): number {
      var testY = (x - x1) / (x2 - x1) * (y2 - y1) + y1;
      return testY > y ? 1 : testY < y ? -1 : 0
    }
  }


  function drawMultiPolygon(ctx: CanvasRenderingContext2D, data: [number, number][][][], mt: number = 1, start: [number, number]) {
    ctx.translate(...start);
    for (let i of data) {
      for (let j of i) {
        lineFormTo(ctx, j, mt);
      }
    }
  }


  //缓存最大值和最小值
  function cacheMaxAndMin() {
    var cache: MaxAndMin = { max: -Infinity, min: Infinity }
    return function (value?: number): MaxAndMin {
      if (value) {
        if (value > cache.max) cache.max = value;
        if (value < cache.min) cache.min = value;
      }
      return cache
    }
  }


  //点到点,放大倍数
  function lineFormTo(ctx: CanvasRenderingContext2D, arr: Array<[number, number]>, mt: number) {
    arr = times(arr, mt);
    ctx.beginPath();
    ctx.moveTo(...arr[0]);
    for (let i in arr) {
      let [x, y] = arr[i];
      x = fixed(x) + .5;
      y = fixed(y) + .5
      ctx.lineTo(x, y)
    }
    ctx.stroke();
    ctx.closePath();
  }


  //times倍
  function times(arr: Array<[number, number]>, times: number): Array<[number, number]> {
    return arr.map(v => {
      return [v[0] * times, v[1] * times];
    })
  }



  //创建new canvas
  function createNewCanvas(w: number, h: number): HTMLCanvasElement {
    let canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }


  //节流
  function throttle(fn: Function): Function {
    let queue: Array<any> = []; //队列
    const req = window.requestAnimationFrame;
    return function (this: any, ...arg: Array<any>) {
      if (queue.length === 0) { //队列为空时,创建新延迟
        req(() => {
          if (queue.length) {
            fn.apply(this, queue.pop()); //最后一次
            queue = []; //清空
          }
        });
      };
      queue.push(arg) //加入队列
    }
  };

  return Geo
})