(function(){
    var drawnItems = new L.FeatureGroup();
    var map;
    var geojson = null;
    var results = null;
    var endpoint = 'http://wopr.datamade.us';
    // TODO: ResponseView should be a wrapper for individual ChartViews and a
    // ChartView + a DataDetailView once you drill down into a dataset
    var ResponseView = Backbone.View.extend({
        events: {
            'click .data-download': 'fetchDownload',
            'click .explore': 'exploreDataset'
        },
        render: function(){
            var self = this;
            this.query = this.attributes.query;
            $.when(this.getResults()).then(function(resp){
                self.$el.spin(false);
                self.$el.html('');
                results = resp.objects;
                $.each(results, function(i, obj){
                    var el = obj.objects[0].dataset_name;
                    var chart_id = el + '_' + i;
                    var item = {
                        el: el,
                        chart_id: chart_id,
                        objects: obj
                    }
                    var chartTpl = new EJS({url: self.template});
                    self.$el.append(chartTpl.render(item));
                    var data = [];
                    $.each(obj.objects, function(i, o){
                        data.push([moment(o.group).unix()*1000, o.count]);
                    });
                    ChartHelper.create(el, obj.dataset_name, 'City of Chicago', agg, data, i);
                });
            }).fail(function(resp){
                this.$el.spin(false);
                var error = {
                    header: 'Woops!',
                    body: resp['responseJSON']['meta']['message'],
                }
                var errortpl = new EJS({url: 'js/templates/modalTemplate.ejs'})
                $('#errorModal').html(errortpl.render(error));
                $('#errorModal').modal();
            });
        },
        fetchDownload: function(e){
            var dataset = $(e.target).attr('id').split('-')[0];
            var datatype = $(e.target).attr('id').split('-')[1];
            var url = endpoint + '/api/master/?' + $.param(this.query) + '&dataset_name=' + dataset + '&datatype=' + datatype;
            window.open(url, '_blank');
        },
        exploreDataset: function(){
            var dataset = $(e.target).attr('id').split('-')[0];
            console.log('exploreit');
        },
        getResults: function(){
            var self = this;
            return $.ajax({
                url: endpoint + '/api/master/',
                dataType: 'json',
                data: self.query
            });
        },
        parseParams: function(query){
            var re = /([^&=]+)=?([^&]*)/g;
            var decodeRE = /\+/g;  // Regex for replacing addition symbol with a space
            var decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );};
            var params = {}, e;
            while ( e = re.exec(query) ) {
                var k = decode( e[1] ), v = decode( e[2] );
                if (k.substring(k.length - 2) === '[]') {
                    k = k.substring(0, k.length - 2);
                    (params[k] || (params[k] = [])).push(v);
                }
                else params[k] = v;
            }
            return params;
        }
    });
    $(document).ready(function(){
        resize_page();
        window.onresize = function(event){
            resize_page();
        }
        var then = moment().subtract('d', 180)
        $('#start-date-filter').attr('placeholder', then.format('MM-DD-YYYY'));
        $('#end-date-filter').attr('placeholder', moment().format('MM-DD-YYYY'));
        map = L.map('map').setView([41.880517,-87.644061], 11);
        L.tileLayer('http://{s}.tile.cloudmade.com/{key}/{styleId}/256/{z}/{x}/{y}.png', {
          attribution: 'Mapbox <a href="http://mapbox.com/about/maps" target="_blank">Terms &amp; Feedback</a>',
          key: 'BC9A493B41014CAABB98F0471D759707',
          styleId: 22677
        }).addTo(map);
        map.addLayer(drawnItems);
        var drawControl = new L.Control.Draw({
            edit: {
                    featureGroup: drawnItems
            },
            draw: {
                polyline: false,
                circle: false,
                marker: false
            }
        });
        map.addControl(drawControl);
        map.on('draw:created', draw_create);
        map.on('draw:drawstart', draw_delete);
        map.on('draw:edited', draw_edit);
        map.on('draw:deleted', draw_delete);
        $('.date-filter').datepicker({
            dayNamesMin: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            prevText: '',
            nextText: ''
        });
        $('#submit-query').on('click', submit_form);
        $('#reset').click(function() {
            location.reload();
        });
      //if (window.location.hash){
      //    var query = {};
      //    var agg = '';
      //    var hash = parseParams(window.location.hash.replace('#',''));
      //    $.each(hash, function(key, val){
      //        if (key == 'agg'){
      //            agg = val
      //        } else {
      //            query[key] = val;
      //        }
      //    });
      //    // Render view
      //    // run_query(query, agg);
      //    if(query.geom__within !== 'undefined'){
      //        geojson = $.parseJSON(query.geom__within);
      //        var opts = {
      //            stroke: true,
      //            color: '#f06eaa',
      //            weight: 4,
      //            opacity: 0.5,
      //            fill: true,
      //            fillColor: '#f06eaa',
      //            fillOpacity: 0.2,
      //            clickable: true
      //        }
      //        var layer = L.geoJson(geojson, opts);
      //        drawnItems.addLayer(layer);
      //    }
      //    $('#start-date-filter').val(query['obs_date__ge']);
      //    $('#end-date-filter').val(query['obs_date__le']);
      //    $('#time-agg-filter').val(agg);
      //}
    });

    function submit_form(e){
        $('#response').spin('large');
        var message = null;
        var query = {};
        var start = $('#start-date-filter').val();
        var end = $('#end-date-filter').val();
        start = moment(start);
        if (!start){
            start = moment().subtract('days', 180);
        }
        end = moment(end)
        if(!end){
            end = moment();
        }
        var valid = true;
        if (start.isValid() && end.isValid()){
            start = start.startOf('day').format('YYYY/MM/DD');
            end = end.endOf('day').format('YYYY/MM/DD');
        } else {
            valid = false;
            message = 'Your dates are not entered correctly';
        }
        query['obs_date__le'] = end;
        query['obs_date__ge'] = start;
        if (geojson){
            query['geom__within'] = JSON.stringify(geojson);
        }
        query['agg'] = $('#time-agg-filter').val();
        if(valid){
            // run_query();
            var resp = new ResponseView({el: '#response', attributes: {query: query}});
            resp.render();
        } else {
            $('#response').spin(false);
            var error = {
                header: 'Woops!',
                body: message,
            }
            var errortpl = new EJS({url: 'js/templates/modalTemplate.ejs'})
            $('#errorModal').html(errortpl.render(error));
            $('#errorModal').modal();
        }
    }

    function draw_create(e){
        drawnItems.clearLayers();
        edit_create(e.layer, e.target);
    }

    function draw_edit(e){
        var layers = e.layers;
        drawnItems.clearLayers();
        layers.eachLayer(function(layer){
            edit_create(layer, e.target);
        });
    }

    function draw_delete(e){
        drawnItems.clearLayers();
    }

    function edit_create(layer, map){
        geojson = layer.toGeoJSON();
        drawnItems.addLayer(layer);
    }
    function resize_page(){
        $('.half-height').height((window.innerHeight  / 2) - 40);
    }

})()
