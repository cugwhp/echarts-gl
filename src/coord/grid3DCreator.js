var Cartesian3D = require('./grid3D/Cartesian3D');
var Axis3D = require('./grid3D/Axis3D');
var echarts = require('echarts/lib/echarts');
var layoutUtil = require('echarts/lib/util/layout');
var ViewGL = require('../core/ViewGL');
var retrieve = require('../util/retrieve');

function resizeCartesian3D(grid3DModel, api) {
    // Use left/top/width/height
    var boxLayoutOption = grid3DModel.getBoxLayoutParams();

    var viewport = layoutUtil.getLayoutRect(boxLayoutOption, {
        width: api.getWidth(),
        height: api.getHeight()
    });

    // Flip Y
    viewport.y = api.getHeight() - viewport.y - viewport.height;

    this.viewGL.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, api.getDevicePixelRatio());

    var boxWidth = grid3DModel.get('boxWidth');
    var boxHeight = grid3DModel.get('boxHeight');
    var boxDepth = grid3DModel.get('boxDepth');

    if (__DEV__) {
        ['x', 'y', 'z'].forEach(function (dim) {
            if (!this.getAxis(dim)) {
                throw new Error('Grid' + grid3DModel.id + ' don\'t have ' + dim + 'Axis');
            }
        }, this);
    }
    this.getAxis('x').setExtent(-boxWidth / 2, boxWidth / 2);
    // From near to far
    this.getAxis('y').setExtent(boxDepth / 2, -boxDepth / 2);
    this.getAxis('z').setExtent(-boxHeight / 2, boxHeight / 2);

    this.size = [boxWidth, boxHeight, boxDepth];
}

function updateCartesian3D(ecModel, api) {
    var dataExtents = {};
    function unionDataExtents(dim, extent) {
        dataExtents[dim] = dataExtents[dim] || [Infinity, -Infinity];
        dataExtents[dim][0] = Math.min(extent[0], dataExtents[dim][0]);
        dataExtents[dim][1] = Math.max(extent[1], dataExtents[dim][1]);
    }
    // Get data extents for scale.
    ecModel.eachSeries(function (seriesModel) {
        if (seriesModel.coordinateSystem !== this) {
            return;
        }
        var data = seriesModel.getData();
        ['x', 'y', 'z'].forEach(function (dim) {
            unionDataExtents(
                dim, data.getDataExtent(seriesModel.coordDimToDataDim(dim)[0], true)
            );
        });
    }, this);

    ['xAxis3D', 'yAxis3D', 'zAxis3D'].forEach(function (axisType) {
        ecModel.eachComponent(axisType, function (axisModel) {
            var dim = axisType.charAt(0);
            var grid3DModel = axisModel.getReferringComponents('grid3D')[0];
            
            var cartesian3D = grid3DModel.coordinateSystem;
            if (cartesian3D !== this) {
                return;
            }

            var axis = cartesian3D.getAxis(dim);
            if (axis) {
                if (__DEV__) {
                    console.warn('Can\'t have two %s in one grid3D', axisType);
                }
                return;
            }
            var scale = echarts.helper.createScale(
                dataExtents[dim] || [Infinity, -Infinity], axisModel
            );
            axis = new Axis3D(dim, scale);
            axis.type = axisModel.get('type');
            var isCategory = axis.type === 'category';
            axis.onBand = isCategory && axisModel.get('boundaryGap');
            axis.inverse = axisModel.get('inverse');

            axisModel.axis = axis;
            axis.model = axisModel;

            cartesian3D.addAxis(axis);
        }, this);
    }, this);

    this.resize(this.model, api);
}

var grid3DCreator = {

    dimensions: Cartesian3D.prototype.dimensions,

    create: function (ecModel, api) {

        var cartesian3DList = [];

        ecModel.eachComponent('grid3D', function (grid3DModel) {
            // FIXME
            grid3DModel.__viewGL = grid3DModel.__viewGL || new ViewGL();

            var cartesian3D = new Cartesian3D();
            cartesian3D.model = grid3DModel;
            cartesian3D.viewGL = grid3DModel.__viewGL;

            grid3DModel.coordinateSystem = cartesian3D;
            cartesian3DList.push(cartesian3D);

            // Inject resize and update
            cartesian3D.resize = resizeCartesian3D;

            cartesian3D.update = updateCartesian3D;
        });

        var axesTypes = ['xAxis3D', 'yAxis3D', 'zAxis3D'];
        function findAxesModels(seriesModel, ecModel) {
            return axesTypes.map(function (axisType) {
                var axisModel = seriesModel.getReferringComponents(axisType)[0];
                if (axisModel == null) {
                    axisModel = ecModel.getComponent(axisType);
                }
                if (__DEV__) {
                    if (!axisModel) {
                        throw new Error(axisType + ' "' + retrieve.firstNotNull(
                            seriesModel.get(axisType + 'Index'),
                            seriesModel.get(axisType + 'Id'),
                            0
                        ) + '" not found');
                    }
                }
                return axisModel;
            });
        }

        ecModel.eachSeries(function (seriesModel) {
            if (seriesModel.get('coordinateSystem') !== 'cartesian3D') {
                return;
            }
            var firstGridModel = seriesModel.getReferringComponents('grid3D')[0];

            if (firstGridModel == null) {
                var axesModels = findAxesModels(seriesModel, ecModel);
                var firstGridModel = axesModels[0].getCoordSysModel();
                axesModels.forEach(function (axisModel) {
                    var grid3DModel = axisModel.getCoordSysModel();
                    if (__DEV__) {
                        if (!grid3DModel) {
                            throw new Error(
                                'grid3D "' + retrieve.firstNotNull(
                                    axisModel.get('gridIndex'),
                                    axisModel.get('gridId'),
                                    0
                                ) + '" not found'
                            );
                        }
                        if (grid3DModel !== firstGridModel) {
                            throw new Error('xAxis3D, yAxis3D, zAxis3D must use the same grid');
                        }
                    }
                });
            }

            var coordSys = firstGridModel.coordinateSystem;
            seriesModel.coordinateSystem = coordSys;
        });

        return cartesian3DList;
    }
};

echarts.registerCoordinateSystem('grid3D', grid3DCreator);

module.exports = grid3DCreator;