import MVT from 'ol/format/MVT';
import {replayDeclutter} from "ol/render/canvas/ReplayGroup";
import {getSquaredTolerance, renderFeature} from "ol/renderer/vector";
import CanvasReplayGroup from "ol/render/canvas/ReplayGroup";

const Cesium = require('cesium/Cesium');
const Rbush = require('rbush');
const mvtParser = new MVT();

window.canvasCache = {};
class Declutter {

    constructor() {
        this.rbush = Rbush(9, undefined);
        this.declutterReplays = {};
        this.contexts = [];
    }

    addContext(declutterReplays, context) {
        this.contexts.push({
            declutterReplays: declutterReplays,
            context: context
        });

    }

    render() {
        var declutterReplays = this.declutterReplays;
        this.contexts.forEach((a) => {
            const declutterReplays = a.declutterReplays;
            const context = a.context;
            replayDeclutter(declutterReplays, context, 0, true);
        });
    }

    getRbush() {
        return this.rbush;
    }

    getDeclutterReplays() {
        return this.declutterReplays;
    }

}

class MapboxVectorTileLayer {

    constructor(options) {
        this.provider = new Cesium.MapboxVectorTileProvider({
            url: options.url,
            projection: "4326",
            maximumLevel: options.maximumLevel,
            owner: this
        });
        this.url = options.url;
        // this.name = name;
        this.indexes = options.indexes;
        this.funStyle = options.funStyle;
        this.canvases = {};

        this._backGroundPolygonFeature = undefined;
    }

    beginFrame(frameState) {
        /*frameState[this.name] = {
            tileCount: 0,
            declutter: new Declutter(),
            getDeclutter: function () {
                return this.declutter;
            },

            addRef() {
                this.tileCount++;
            },

            enouthTile(size) {
                return this.tileCount >= size;
            }
        }*/
    }

    endFrame(frameState) {

    }

    drawContext(canvas, features, x, y, level, provider) {
        const rbush = Rbush(9, undefined); // declutter.getRbush();
        const vectorContext = canvas.getContext('2d');
        const extent = [0, 0, 4096, 4096];
        //避让方法
        let replayGroup = new CanvasReplayGroup(0, extent, 8, window.devicePixelRatio, true, rbush, 100);
        //不避让方法
        // let replayGroup = new CanvasReplayGroup(0,extent,8,window.devicePixelRatio,true,null,100);
        const squaredTolerance = getSquaredTolerance(8, window.devicePixelRatio);

        if(x === 6 && y===1 && level ===2){
            // console.log(features);
        }
        for (let i = 0; i < features.length; i++) {
            const feature = features[i];
            const styles = this.funStyle(features[i], level);
            if (!!styles && !!styles.length) {
                for (let j = 0; j < styles.length; j++) {
                    /*if(!!styles[j].getText() && styles[j].getText().getText() === '呼和浩特市'){
                        console.log(x+"---"+y+"---"+level);
                        console.log(feature);
                    }*/
                    renderFeature(replayGroup, feature, styles[j], squaredTolerance);
                }
            }
        }
        replayGroup.finish();

        const declutterReplays = {};
        replayGroup.replay(vectorContext, provider._transform, 0, {}, true, provider._replays, declutterReplays);
        replayDeclutter(declutterReplays, vectorContext, 0, true); // vectorContents.push(vectorContext);

        //  provider.trimTile();
        // provider.markTileRendered(canvas);

        /*canvas.xMvt = x;
        canvas.yMvt = y;
        canvas.zMvt = level;*/

        replayGroup = null;
    }

    takeCanvas(id) {
        if (!!this.canvases[id]) {
            return this.canvases[id];
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            this.canvases[id] = {
                canvas: canvas,
                already: false,
                count: 0
            };
            // canvas.tileQuene = this.provider._tileQueue;
            canvas.mvtProvider = this.provider;
            return this.canvases[id];
        }
    }

    removeCanvas(id) {
        if (!!this.canvases[id]) {
            delete this.canvases[id];
        }
    }

    fetchFeatures(index, x, y, level, done) {
        var that = this;
        var pbfUrl = this.url.replace('{x}', x).replace('{y}', y).replace('{z}', level).replace('{index}', index);
        const resource = Cesium.Resource.createIfNeeded(pbfUrl);
        var features ;
        resource.fetchArrayBuffer().then(function (arrayBuffer) {
            features = mvtParser.readFeatures(arrayBuffer) || [];
            if(index === '11' && level === 12 && !that._backGroundPolygonFeature){
                features.some(function (item) {
                    if(item.getType() === 'Polygon'){
                        that._backGroundPolygonFeature = item;
                        return true;
                    }
                })
            }
            done(features);
            // that.drawContext(canvas, features, x, y, level, provider);
            // cc.already = true;
            //  return canvas;
        }).otherwise(function (error) {
            if(level > 12){
                if(that._backGroundPolygonFeature !== undefined){
                    features = [that._backGroundPolygonFeature];
                    done(features);
                }else {
                    var pbfUrl = that.url.replace('{x}', Math.floor(x / 2)).replace('{y}', Math.floor(y / 2)).replace('{z}', 12).replace('{index}', 11);
                    const resource = Cesium.Resource.createIfNeeded(pbfUrl);
                    resource.fetchArrayBuffer().then(function (arrayBuffer){
                        features = mvtParser.readFeatures(arrayBuffer) || [];
                        features.some(function (item) {
                            if(item.getType() === 'Polygon'){
                                that._backGroundPolygonFeature = item;
                                return true;
                            }
                        })
                        done([that._backGroundPolygonFeature]);
                    })
                }
            }else {
                done([]);
            }
            /*if(!that._backGroundPolygonFeature && level > 12){
                console.log("sssssssssssssssssssssssssss");

            }
            if(level === 13 && x === 13488 && y === 2280){

            }
            if(that._backGroundPolygonFeature !== undefined && level > 12){
                features = [that._backGroundPolygonFeature];
            }else {
                features = [];
            }
            done(features);*/
        });

    }

    requestTile(x, y, level, request, frameState, provider) {
        const that = this;
        const doRequest = function (x, y, z) {
            const id = "{z}_{x}_{y}"
                .replace("{z}", z)
                .replace("{x}", x)
                .replace("{y}", y);

            const cc = that.takeCanvas(id);
            if (cc.already) {
                const p = new Promise(function (onFulfilled) {
                    try {
                        provider.trimTile();
                        provider.markTileRendered(cc.canvas);
                        try {
                            // var id1 = (x-1)+"-"+y+"-"+z;
                            var leftTile = that.provider._tileQueue.findTile(x-1,y,z,that.provider._tileQueue);
                            if(!!leftTile){
                                var needToDraw = leftTile.needToDraw;
                                var ctx = cc.canvas.getContext("2d");
                                needToDraw.forEach(item =>{
                                    ctx.drawImage(item.image, item.originX, item.originY, item.w, item.h, item.x, item.y, item.width, item.height);
                                })
                                needToDraw.length = 0;
                                // provider._reloadVectorTile(cc.canvas);
                                provider._reload();
                            }
                            /*if(!!window.canvasCache[id1]){
                                var canvas25_4_4 = window.canvasCache[id1];
                                var needToDraw = canvas25_4_4.needToDraw;
                                var ctx = cc.canvas.getContext("2d");
                                needToDraw.forEach(item =>{
                                    ctx.drawImage(item.image, item.originX, item.originY, item.w, item.h, item.x, item.y, item.width, item.height);
                                })
                            }*/
                        }catch (e) {
                            console.error(e);
                        }

                        that.removeCanvas(id);

                        return onFulfilled(cc.canvas);
                    } catch (e) {
                        return rejected(e);
                    }
                });
                return p;
            } else if (cc.count == 0) {
                const canvas = cc.canvas;
                cc.count++;

                // const indexes = ["11"];
                var features = [];
                var count = 0;
                var done = function (items) {
                    count++;
                    items.forEach(a => {
                        features.push(a);
                    });
                    if (count == that.indexes.length) {
                        if (features.length > 0) {
                            canvas.xMvt = x;
                            canvas.yMvt = y;
                            canvas.zMvt = z;
                            canvas.needToDraw = [];
                            // var id = x+"-"+ y+"-"+z;
                            // window.canvasCache[id] = canvas;
                            that.drawContext(canvas, features, x, y, level, provider);
                        }
                        cc.already = true;
                    }
                };

                const url = that.url;

                for (let i = 0; i < that.indexes.length; ++i) {
                    const index = that.indexes[i];
                    /*const pbfUrl = url.replace('{x}', x).replace('{y}', y).replace('{z}', level).replace('{index}', index);
                    that.fetchFeatures(pbfUrl, done);*/
                    that.fetchFeatures(index, x, y, level, done);
                }

            }


            // return new Promise(resolve => {
            //     return canvas;
            // });

            //
            // var promise1 = new Promise(function(resolve, reject) {
            //     setTimeout(function() {
            //         resolve('foo');
            //     }, 300);
            // });
            //
            // promise1.then(function(value) {
            //     console.log(value);
            //     // expected output: "foo"
            // });
        };

        return doRequest(x, y, level);
    }

    getProvider() {
        return this.provider;
    }

}


export {MapboxVectorTileLayer};


// const rbush = Rbush(9, undefined); // declutter.getRbush();
//
// const extent = [0, 0, 4096, 4096];
// let replayGroup = new CanvasReplayGroup(0, extent, 8, window.devicePixelRatio, true, rbush, 100);
// const squaredTolerance = getSquaredTolerance(8,
//     window.devicePixelRatio);
//
// for (let i = 0; i < features.length; i++) {
//     const feature = features[i];
//     const styles = that.funStyle(features[i], level);
//     if (!!styles && !!styles.length) {
//         for (let j = 0; j < styles.length; j++) {
//             renderFeature(replayGroup, feature, styles[j], squaredTolerance);
//         }
//     }
// }
// replayGroup.finish();
//
// const declutterReplays = {}; //declutter.getDeclutterReplays(); // {};
// replayGroup.replay(vectorContext, provider._transform, 0, {}, true, provider._replays, declutterReplays);
// replayDeclutter(declutterReplays, vectorContext, 0, true); // vectorContents.push(vectorContext);
//
// provider.trimTile();
// provider.markTileRendered(canvas);
//
// canvas.xMvt = x;
// canvas.yMvt = y;
// canvas.zMvt = level;
//
// replayGroup = null;
