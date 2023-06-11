import openzgycpp as zgy
import os
import re
import enum
import math
import json
import vector

from ..shared.description import Role, api_description
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security.api_key import APIKey
from starlette.status import HTTP_500_INTERNAL_SERVER_ERROR

from api.dependencies.authentication import get_bearer, get_api_key, configure_remote_access
from core.config import settings
VERSION = 2

router = APIRouter()
PATH = settings.API_PATH + 'v' + str(VERSION) + '/'

def internal_server_error(e: Exception): 
    return HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

def zgy_error(ze: zgy.ZgyError):
    message = str(ze)
    matched = re.search('HTTP [0-9][0-9][0-9]', message)
    if(matched):
        http_error = int(matched.group().split()[1])
        return HTTPException(status_code=http_error, detail=message)
    
    return HTTPException(status_code=HTTP_500_INTERNAL_SERVER_ERROR, detail=message)

class P6Bin(enum.Enum):
    P6BinGridOriginI = 1
    P6BinGridOriginJ = 2
    P6BinGridOriginEasting = 3
    P6BinGridOriginNorthing = 4
    P6BinNodeIncrementOnIaxis = 5
    P6BinNodeIncrementOnJaxis = 6
    P6BinWidthOnIaxis = 7
    P6BinWidthOnJaxis = 8
    P6TransformationMethod = 10
    P6MapGridBearingOfBinGridJaxis = 11
    BinGridLocalCoordinates = 12


class Line:
    def __init__(self, start, increment, count):
        self.start = start
        self.increment = increment
        self.count = count

    def __repr__(self):
        return f"start: {self.start} increment: {self.increment} count: {self.count}"

    def __str__(self):
        return f"start: {self.start} increment: {self.increment} count: {self.count}"


class Point:
    def __init__(self, i, j, inline, xline, easting, northing):
        self.i = i
        self.j = j
        self.inline = inline
        self.xline = xline
        self.easting = easting
        self.northing = northing
        self.vector = vector.obj(x=self.easting, y=self.northing)

    def __repr__(self):
        return f"i: {self.i} j: {self.j} inline: {self.inline} xline: {self.xline} easting: {self.easting} northing: {self.northing}"

    def __str__(self):
        return f"i: {self.i} j: {self.j} inline: {self.inline} xline: {self.xline} easting: {self.easting} northing: {self.northing}"


class ZGYToBinGrid:
    def __init__(self, point00, point10, point01, point11, inline, xline):
        self.point00 = point00
        self.point10 = point10
        self.point01 = point01
        self.point11 = point11
        self.inline = inline
        self.xline = xline

    def getValue(self, attribute):
        if attribute == P6Bin.P6BinGridOriginI:
            return self.point00.inline

        elif attribute == P6Bin.P6BinGridOriginJ:
            return self.point00.xline

        elif attribute == P6Bin.P6BinGridOriginEasting:
            return self.point00.easting

        elif attribute == P6Bin.P6BinGridOriginNorthing:
            return self.point00.northing

        elif attribute == P6Bin.P6BinNodeIncrementOnIaxis:
            return self.inline.increment

        elif attribute == P6Bin.P6BinNodeIncrementOnJaxis:
            return self.xline.increment

        elif attribute == P6Bin.P6BinWidthOnIaxis:
            return math.ceil(abs(self.point10.vector - self.point00.vector) / (self.inline.count - 1))

        elif attribute == P6Bin.P6BinWidthOnJaxis:
            return math.ceil(abs(self.point01.vector - self.point00.vector) / (self.xline.count - 1))

        elif attribute == P6Bin.P6TransformationMethod:
            a1 = self.point10.vector - self.point00.vector
            b1 = self.point01.vector - self.point00.vector
            a2 = self.point11.vector - self.point01.vector
            b2 = self.point11.vector - self.point10.vector

            if a1.dot(b2) - a2.dot(b1) > 0:
                return 9666
            else:
                return 1049

        elif attribute == P6Bin.P6MapGridBearingOfBinGridJaxis:
            b = self.point01.vector - self.point00.vector
            b1 = b.x
            b2 = b.y
            angle = math.acos(b2 / abs(b))
            if b1 >= 0:
                return round((angle * 180) / math.pi, 2)
            else:
                return round(360 - (angle * 180) / math.pi)

        elif attribute == P6Bin.BinGridLocalCoordinates:
            points = [self.point00, self.point01, self.point11, self.point10, self.point00]
            lst = []
            for point in points:
                m = {}
                m["X"] = point.easting
                m["Y"] = point.northing
                lst.append(m)
            return lst

    def getValusAsJson(self):
        m = {}
        for attr in P6Bin:
            m[attr.name] = self.getValue(attr)

        return json.dumps(m, indent=2)


@router.get(PATH + "openzgy/headers", tags=["OPENZGY"], description=api_description("headers", Role.viewer))
async def get_headers(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    try:
        with zgy.ZgyReader(sdpath, iocontext={"sdurl": settings.SDMS_URL, "sdapikey": api_key,
                                          "sdtoken": bearer}) as reader:
            headers = {
                'Guid':                    str(reader.verid),
                'Size':                    reader.size,
                'BrickSize':               reader.bricksize,
                'DataType':                str(reader.datatype),
                'DataRange':               reader.datarange,
                'ZUnitDimension':          str(reader.zunitdim),
                'ZUnitName':               reader.zunitname,
                'ZUnitFactor':             reader.zunitfactor,
                'ZStart':                  reader.zstart,
                'ZIncrement':              reader.zinc,
                'XYUnitDimension':         str(reader.hunitdim),
                'XYUnitName':              reader.hunitname,
                'XYUnitFactor':            reader.hunitfactor,
                'InlineStart':             reader.annotstart[0],
                'InlineIncrement':         reader.annotinc[0],
                'CrosslineStart':          reader.annotstart[1],
                'CrosslineIncrement':      reader.annotinc[1],
                'WorldCorners':            reader.corners,
                'IndexCorners':            reader.indexcorners,
                'AnnotationCorners':       reader.annotcorners,
                'AmountOfLevelsOfDetail':  reader.nlods,
                'BricksPerLevelsOfDetail': reader.brickcount,
                'Statistics':              {'Count': reader.statistics[0], 'Sum': reader.statistics[1], 'SumOfSquares': reader.statistics[2], 'Minimum': reader.statistics[3],'Maximum': reader.statistics[4]},
                'Histogram':               {'Count': reader.histogram[0], 'Minimum': reader.histogram[1], 'Maximum':reader.histogram[2], 'Bins': reader.histogram[3]}
            }
            return json.loads(json.dumps(headers, indent=2))
    except zgy.ZgyError as ze:
        raise zgy_error(ze)
    except Exception as e:
        raise internal_server_error(e)


@router.get(PATH + "openzgy/bingrid", tags=["OPENZGY"], description=api_description("bingrid", Role.viewer))
async def get_bingrid(
        sdpath: str,
        bearer: APIKey = Depends(get_bearer),
        api_key: APIKey = Depends(get_api_key)):
    try:
        with zgy.ZgyReader(sdpath, iocontext={"sdurl": settings.SDMS_URL, "sdapikey": api_key,
                                          "sdtoken": bearer}) as r:        
            inline = Line(r.annotstart[0], r.annotinc[0], r.size[0])
            xline = Line(r.annotstart[1], r.annotinc[1], r.size[1])
            point00 = Point(r.indexcorners[0][0], r.indexcorners[0][1], 
                           r.annotcorners[0][0], r.annotcorners[0][1],
                                r.corners[0][0], r.corners[0][1])
            
            point10 = Point(r.indexcorners[1][0], r.indexcorners[1][1], 
                           r.annotcorners[1][0], r.annotcorners[1][1],
                                r.corners[1][0], r.corners[1][1])
            
            point01 = Point(r.indexcorners[2][0], r.indexcorners[2][1], 
                           r.annotcorners[2][0], r.annotcorners[2][1],
                                r.corners[2][0], r.corners[2][1])
            
            point11 = Point(r.indexcorners[3][0], r.indexcorners[3][1], 
                           r.annotcorners[3][0], r.annotcorners[3][1],
                                r.corners[3][0], r.corners[3][1])
            
            zgyToBinGrid = ZGYToBinGrid(point00, point10, point01, point11, inline, xline)
            return json.loads(zgyToBinGrid.getValusAsJson())
    except zgy.ZgyError as ze:
        raise zgy_error(ze)
    except Exception as e:
        raise internal_server_error(e)