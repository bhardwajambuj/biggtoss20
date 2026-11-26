"""House geometry for Bigg Toss.

Single source of truth: the server uses it for collision and bot navigation,
and serves it to the browser (as /data/world.json) for rendering and movement.

Layout follows the Bigg Boss 20 house as shown in the official house tour:
garden with shark pool, flower tap and snake tree; ringmaster statue over the
main entrance; living area with teapot throne, balloon seat and 12-seat dining
table; BB Food Truck kitchen; 17-bed bedroom; bathroom; confession room;
Room 20 (Wall of Fame) and Room 2X (pressure pods).
"""

import heapq
import math
import random

W, H = 2640, 1800
FACE = 90  # on-screen height of a north wall face

ROOMS = [
    {"id": "garden", "name": "Garden Area", "r": [80, 1090, 2480, 650]},
    {"id": "bath", "name": "Bathroom", "r": [80, 560, 400, 440]},
    {"id": "bed", "name": "Bedroom", "r": [500, 430, 620, 570]},
    {"id": "living", "name": "Living Area", "r": [1140, 430, 860, 570]},
    {"id": "kitchen", "name": "BB Food Truck", "r": [2020, 430, 540, 570]},
    {"id": "conf", "name": "Confession Room", "r": [1160, 110, 260, 210]},
    {"id": "r20", "name": "Room 20 · Wall of Fame", "r": [1720, 110, 260, 210]},
    {"id": "r2x", "name": "Room 2X", "r": [2060, 110, 460, 210]},
]

# Openings between rooms. d: n = through a north wall face, v = through a
# side wall, s = through the glass facade into the garden.
DOORS = [
    {"id": "conf", "r": [1260, 320, 60, 110], "d": "n", "label": "CONFESSION"},
    {"id": "r20", "r": [1820, 320, 60, 110], "d": "n", "label": "20"},
    {"id": "r2x", "r": [2110, 320, 60, 110], "d": "n", "label": "2X"},
    {"id": "mini", "r": [2290, 320, 44, 110], "d": "n", "label": "", "mini": 1},
    {"id": "bedliving", "r": [1120, 500, 20, 120], "d": "v"},
    {"id": "livkitchen", "r": [2000, 500, 20, 300], "d": "v"},
    {"id": "bathbed", "r": [480, 780, 20, 80], "d": "v"},
    {"id": "main", "r": [1660, 1000, 80, 90], "d": "s"},
    {"id": "bathgarden", "r": [250, 1000, 80, 90], "d": "s"},
    {"id": "kitgarden", "r": [2360, 1000, 80, 90], "d": "s"},
]

WATER = [1960, 1280, 480, 300]
SPAWN_GATE = (1700, 1620)
SPAWN_2X = (2230, 268)

PROPS = []
SEATS = []
STOOLS = []

# Furniture you can jump onto: kind -> height of its top surface in px.
# Everything else that is solid (walls, statues, the truck...) stays solid.
CLIMB = {"bed": 22, "bedside": 22, "sofafront": 24, "sofaside": 24, "ottoman": 20,
         "ctable": 18, "dining": 30, "choc": 22, "counter": 34}


def _p(k, x, y, w, h, solid=True, **kw):
    d = {"k": k, "r": [x, y, w, h], "s": 1 if solid else 0}
    if solid and k in CLIMB:
        d["top"] = CLIMB[k]
    d.update(kw)
    PROPS.append(d)


def _s(x, y, k="sit", t=None, f=0, **kw):
    d = {"x": x, "y": y, "k": k, "f": f, "t": t or [x - 16, y - 12, 32, 24]}
    d.update(kw)
    SEATS.append(d)


def _stool(x, y, v="stool"):
    STOOLS.append({"x": x, "y": y, "v": v})
    _s(x, y)


def _build():
    # ---- Living area ----
    _p("tvunit", 1470, 430, 200, 24)
    r = [1400, 590, 50, 140]
    _p("sofaside", *r, f=1, v="living")
    for sy in (628, 670, 712):
        _s(1428, sy, t=r, f=1)
    r = [1690, 590, 50, 140]
    _p("sofaside", *r, f=-1, v="living")
    for sy in (628, 670, 712):
        _s(1712, sy, t=r, f=-1)
    r = [1480, 742, 180, 34]
    _p("ottoman", *r)
    for sx in (1515, 1570, 1625):
        _s(sx, 766, t=r)
    _p("ctable", 1515, 632, 110, 56)
    _p("teapot", 1170, 630, 120, 70)
    r = [1290, 662, 92, 46]
    _p("choc", *r)
    _s(1336, 694, k="throne", t=r)
    r = [1160, 915, 90, 60]
    _p("basket", *r)
    _s(1205, 963, k="basket", t=r, f=1)
    _p("dining", 1310, 860, 280, 50)
    for i in range(5):
        _stool(1338 + 56 * i, 846)
        _stool(1338 + 56 * i, 938)
    _stool(1286, 888)
    _stool(1614, 888)
    _p("plant", 1948, 952, 36, 30, v=0)
    _p("plant", 1152, 440, 30, 24, v=1)
    _p("plant", 1952, 440, 30, 24, v=2)

    # ---- Kitchen: BB Food Truck ----
    _p("truck", 2150, 640, 300, 80)
    for sx in (2210, 2300, 2390):
        _stool(sx, 770, "bar")
    _p("counter", 2500, 470, 60, 480)

    # ---- Room 2X: pressure pods + buzzers ----
    for px in (2370, 2450):
        r = [px, 180, 56, 44]
        _p("pod", *r)
        _s(px + 28, 220, k="pod", t=r)
    _p("buzzer", 2190, 170, 34, 26, v="2")
    _p("buzzer", 2250, 170, 34, 26, v="X")

    # ---- Room 20 ----
    _p("p20", 1815, 170, 70, 36)

    # ---- Confession room ----
    r = [1258, 190, 64, 44]
    _p("cchair", *r)
    _s(1290, 228, k="conf", t=r)

    # ---- Bedroom: 17 beds ----
    n = 0
    for i in range(6):
        r = [520 + 86 * i, 440, 70, 100]
        _p("bed", *r, c=n)
        _s(r[0] + 35, r[1] + 44, k="bed", t=r, a=0)
        n += 1
    for i in range(7):
        r = [520 + 86 * i, 880, 70, 100]
        _p("bed", *r, c=n)
        _s(r[0] + 35, r[1] + 44, k="bed", t=r, a=0)
        n += 1
    for by in (590, 690):
        r = [510, by, 100, 64]
        _p("bedside", *r, c=n, f=1)
        _s(r[0] + 26, r[1] + 46, k="bed", t=r, a=-90)
        n += 1
    for by in (660, 760):
        r = [1010, by, 100, 64]
        _p("bedside", *r, c=n, f=-1)
        _s(r[0] + 74, r[1] + 46, k="bed", t=r, a=90)
        n += 1
    r = [730, 690, 160, 46]
    _p("sofafront", *r, v="bed")
    for sx in (770, 810, 850):
        _s(sx, 730, t=r)

    # ---- Bathroom ----
    _p("sinks", 100, 560, 200, 30)
    r = [220, 760, 120, 42]
    _p("sofafront", *r, v="bath")
    for sx in (255, 305):
        _s(sx, 796, t=r)
    r = [425, 620, 50, 120]
    _p("sofaside", *r, f=-1, v="bath")
    for sy in (656, 702):
        _s(447, sy, t=r, f=-1)
    _p("chimps", 110, 470, 340, 120, solid=False)

    # ---- Garden ----
    _p("leg", 1632, 1092, 26, 34)
    _p("leg", 1742, 1092, 26, 34)
    _p("ringmaster", 1570, 850, 260, 280, solid=False)
    _p("gorilla", 232, 930, 116, 100, solid=False)
    _p("tap", 1876, 1282, 50, 30)
    _p("shark", 2330, 1385, 96, 80)
    r = [420, 1400, 60, 40]
    _p("tree", *r)
    for sx, sy in ((398, 1458), (450, 1468), (502, 1458)):
        _s(sx, sy, t=[390, 1400, 120, 76])
    for gx in (110, 2350):
        r = [gx, 1650, 180, 46]
        _p("sofafront", *r, v="garden")
        for i in range(3):
            _s(gx + 40 + 50 * i, 1690, t=r)
    _p("bag", 880, 1290, 40, 24)
    _p("chess", 1090, 1540, 40, 28, v="king")
    _p("chess", 1170, 1592, 34, 24, v="pawn")
    _p("chess", 1010, 1600, 34, 24, v="knight")
    _p("gmush", 600, 1160, 44, 26)
    _p("gmush", 2200, 1150, 44, 26)
    _stool(690, 1206, "mush")
    _stool(742, 1176, "mush")
    _stool(1300, 1700, "mush")
    _stool(2110, 1690, "mush")


_build()

WALK = [r["r"] for r in ROOMS] + [d["r"] for d in DOORS]
SOLIDS = [p["r"] for p in PROPS if p["s"]]

# ---------------------------------------------------------------- collision
Q = 4  # bitmap resolution in px
BW, BH = W // Q + 1, H // Q + 1
_bm = bytearray(BW * BH)


def _fill(bm, rect, val):
    x, y, w, h = rect
    x0, x1 = max(0, x // Q), min(BW, (x + w) // Q)
    y0, y1 = max(0, y // Q), min(BH, (y + h) // Q)
    row = bytes([val]) * (x1 - x0)
    for cy in range(y0, y1):
        bm[cy * BW + x0: cy * BW + x1] = row


for _r in WALK:
    _fill(_bm, _r, 1)
_hm = bytearray(_bm)  # "hard" map: walls and furniture nobody can climb
for _pr in PROPS:
    if _pr["s"]:
        _fill(_bm, _pr["r"], 0)
        if not _pr.get("top"):
            _fill(_hm, _pr["r"], 0)

# Feet box of a character, relative to (x, y) = centre of the feet.
SAMPLES = [(-15, -9), (0, -9), (15, -9), (-15, 5), (0, 5), (15, 5)]


# The same box grown by 3 px. Lines are checked with this one every 4 px, which
# guarantees that every point in between is clear for the real box.
SAMPLES_WIDE = [(sx + (3 if sx > 0 else -3 if sx < 0 else 0), sy + (3 if sy > 0 else -3)) for sx, sy in SAMPLES]


def _hit(bm, x, y, samples=None):
    for sx, sy in samples or SAMPLES:
        px, py = int(x + sx), int(y + sy)
        if px < 0 or py < 0 or px >= W or py >= H:
            return True
        if not bm[(py // Q) * BW + px // Q]:
            return True
    return False


def blocked(x, y):
    """True if a character cannot stand here on the floor."""
    return _hit(_bm, x, y)


def blocked_hard(x, y):
    """True if nobody can be here at all, even standing on furniture."""
    return _hit(_hm, x, y)


def in_walk(x, y):
    return any(r[0] <= x <= r[0] + r[2] and r[1] <= y <= r[1] + r[3] for r in WALK)


def in_water(x, y):
    wx, wy, ww, wh = WATER
    return wx + 6 < x < wx + ww - 6 and wy + 6 < y < wy + wh - 6


def room_at(x, y):
    for r in ROOMS:
        rx, ry, rw, rh = r["r"]
        if rx <= x <= rx + rw and ry <= y <= ry + rh:
            return r["id"]
    return None


# --------------------------------------------------------------- navigation
CELL = 24
GW, GH = W // CELL, H // CELL
_free = bytearray(GW * GH)
for _cy in range(GH):
    for _cx in range(GW):
        if not blocked(_cx * CELL + CELL / 2, _cy * CELL + CELL / 2):
            _free[_cy * GW + _cx] = 1

_NEI = [(1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
        (1, 1, 1.414), (1, -1, 1.414), (-1, 1, 1.414), (-1, -1, 1.414)]


def _center(c):
    return ((c % GW) * CELL + CELL / 2, (c // GW) * CELL + CELL / 2)


def clear_line(x1, y1, x2, y2, hard=False):
    """Can a character walk the straight line? hard=True only cares about
    walls (used for stepping down off furniture)."""
    bm = _hm if hard else _bm
    d = math.hypot(x2 - x1, y2 - y1)
    n = max(1, math.ceil(d / Q))
    for i in range(1, n):
        t = i / n
        if _hit(bm, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, SAMPLES_WIDE):
            return False
    return not _hit(bm, x2, y2)


def _attach(x, y):
    """Connect an arbitrary point to the nav grid.

    Returns (waypoints, cell): the waypoints lead from (x, y) to the centre of
    a free nav cell without passing through a wall (or through furniture, when
    the point is on the floor). Usually that is a single straight hop; from
    tight nooks it is a short flood-filled detour.
    """
    cx = min(GW - 1, max(0, int(x) // CELL))
    cy = min(GH - 1, max(0, int(y) // CELL))
    if not blocked(x, y):
        hard = False      # on the floor: the way out must be fully walkable
    elif not blocked_hard(x, y):
        hard = True       # standing on furniture: only walls matter
    else:
        hard = None       # inside a wall; should not happen, take what we get
    fallback = None
    for rad in range(0, 7):
        cands = []
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                if max(abs(dx), abs(dy)) != rad:
                    continue
                nx, ny = cx + dx, cy + dy
                if 0 <= nx < GW and 0 <= ny < GH and _free[ny * GW + nx]:
                    px, py = _center(ny * GW + nx)
                    cands.append(((px - x) ** 2 + (py - y) ** 2, ny * GW + nx, px, py))
        cands.sort()
        for _, n, px, py in cands:
            if fallback is None:
                fallback = n
            if hard is None or clear_line(x, y, px, py, hard=hard):
                return [(px, py)], n
    if hard is not None:
        way = _flood(x, y, hard)
        if way:
            return way
    if fallback is None:
        return [], None
    return [_center(fallback)], fallback


def _flood(x, y, hard):
    """Breadth-first search on a 4 px lattice from (x, y) to the nearest nav
    cell centre. Slow, but only needed from awkward corners."""
    bm = _hm if hard else _bm
    start = (0, 0)
    came = {start: None}
    queue = [start]
    qi = 0
    while qi < len(queue) and qi < 6000:
        cur = queue[qi]
        qi += 1
        px, py = x + cur[0] * Q, y + cur[1] * Q
        gx, gy = int(px) // CELL, int(py) // CELL
        if 0 <= gx < GW and 0 <= gy < GH and _free[gy * GW + gx] and not _hit(_bm, px, py):
            c = gy * GW + gx
            ctr = _center(c)
            if clear_line(px, py, ctr[0], ctr[1]):
                pts = []
                while cur is not None:
                    pts.append((x + cur[0] * Q, y + cur[1] * Q))
                    cur = came[cur]
                pts.reverse()
                out = []
                for k in range(1, len(pts)):
                    # keep only the corners
                    if k + 1 < len(pts) and (pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) == \
                            (pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]):
                        continue
                    out.append(pts[k])
                out.append(ctr)
                return out, c
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = (cur[0] + dx, cur[1] + dy)
            if nxt in came or max(abs(nxt[0]), abs(nxt[1])) > 45:
                continue
            if _hit(bm, x + nxt[0] * Q, y + nxt[1] * Q):
                continue
            came[nxt] = cur
            queue.append(nxt)
    return None


def _astar(s, g):
    if s == g:
        return [s]
    gcx, gcy = g % GW, g // GW
    cost = {s: 0.0}
    came = {s: -1}
    heap = [(0.0, 0.0, s)]
    found = False
    while heap:
        _, c, cur = heapq.heappop(heap)
        if cur == g:
            found = True
            break
        if c > cost[cur]:
            continue
        cx, cy = cur % GW, cur // GW
        for dx, dy, w in _NEI:
            nx, ny = cx + dx, cy + dy
            if nx < 0 or ny < 0 or nx >= GW or ny >= GH:
                continue
            n = ny * GW + nx
            if not _free[n]:
                continue
            if dx and dy and not (_free[cy * GW + nx] and _free[ny * GW + cx]):
                continue
            nc = c + w
            if nc < cost.get(n, 1e18):
                cost[n] = nc
                came[n] = cur
                h = math.hypot(nx - gcx, ny - gcy)
                heapq.heappush(heap, (nc + h, nc, n))
    if not found:
        return []
    cells = []
    cur = g
    while cur != -1:
        cells.append(cur)
        cur = came[cur]
    cells.reverse()
    return cells


def find_path(sx, sy, gx, gy):
    """A* over the nav grid, then string-pulled. Returns a list of (x, y).

    Every hop is either between neighbouring free cells, part of an _attach
    lead-in, or verified with clear_line, so a path never cuts through a wall.
    If the goal is not standable (someone on a table, say) the path ends at
    the closest nav cell instead.
    """
    lead, s = _attach(sx, sy)
    tail, g = _attach(gx, gy)
    if s is None or g is None:
        return []
    cells = _astar(s, g)
    if not cells:
        return []
    pts = [_center(c) for c in cells]
    if not blocked(gx, gy):
        pts += tail[-2::-1] + [(gx, gy)]
    out = []
    if len(lead) > 1 or blocked(sx, sy):
        out = list(lead)
        ax, ay = lead[-1]
        i = 1
    else:
        ax, ay = sx, sy
        i = 0
    while i < len(pts):
        j = min(len(pts) - 1, i + 14)
        while j > i and not clear_line(ax, ay, pts[j][0], pts[j][1]):
            j -= 1
        out.append(pts[j])
        ax, ay = pts[j]
        i = j + 1
    return out


def random_point(room_id=None):
    """A random standable point, optionally inside a given room."""
    for _ in range(60):
        if room_id:
            r = next(r for r in ROOMS if r["id"] == room_id)["r"]
        else:
            r = random.choice(ROOMS)["r"]
        x = random.uniform(r[0] + 20, r[0] + r[2] - 20)
        y = random.uniform(r[1] + 16, r[1] + r[3] - 12)
        if not blocked(x, y):
            return (x, y)
    return SPAWN_GATE


def _seat_exits():
    for s in SEATS:
        tx, ty, tw, th = s["t"]
        below = (s["x"], ty + th + 14)
        left = (tx - 18, s["y"])
        right = (tx + tw + 18, s["y"])
        above = (s["x"], ty - 10)
        order = [(s["x"], s["y"])]
        if s["f"] == 1:
            order += [right, below, left, above]
        elif s["f"] == -1:
            order += [left, below, right, above]
        else:
            order += [below, left, right, above]
        pick = next((c for c in order if not blocked(*c)), None)
        if pick is None:
            way, c = _attach(s["x"], s["y"])
            assert c is not None, "seat with no exit: %r" % s
            pick = _center(c)
        s["ex"], s["ey"] = round(pick[0]), round(pick[1])


_seat_exits()

# Spots where a bot can hop onto furniture: (floor x, floor y, top x, top y).
PERCHES = []


def _perches():
    for p in PROPS:
        if not p.get("top") or p["k"] == "choc":
            continue
        x, y, w, h = p["r"]
        xs = [x + w / 2] if w < 160 else [x + w * 0.25, x + w * 0.5, x + w * 0.75]
        ys = [y + h / 2] if h < 160 else [y + h * 0.25, y + h * 0.5, y + h * 0.75]
        cands = ([(gx, y + h + 14) for gx in xs] + [(gx, y - 10) for gx in xs] +
                 [(x - 22, gy) for gy in ys] + [(x + w + 22, gy) for gy in ys])
        for gx, gy in cands:
            if blocked(gx, gy):
                continue
            tx = min(max(gx, x + 18), x + w - 18)
            ty = min(max(gy, y + 14), y + h - 10)
            if blocked_hard(tx, ty) or not clear_line(gx, gy, tx, ty, hard=True):
                continue
            PERCHES.append((round(gx), round(gy), round(tx), round(ty)))


_perches()

assert not blocked(*SPAWN_GATE) and not blocked(*SPAWN_2X)


def as_json():
    return {
        "w": W, "h": H, "face": FACE,
        "rooms": ROOMS, "doors": DOORS, "props": PROPS, "seats": SEATS,
        "stools": STOOLS, "water": WATER, "walk": WALK, "solids": SOLIDS,
        "samples": SAMPLES,
    }
