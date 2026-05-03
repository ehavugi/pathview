/**
 * Python-side helpers for runtime toolbox install + introspection.
 *
 * Loaded into the Pyodide REPL the first time a toolbox operation runs.
 * The functions mirror the build-time logic in `scripts/extract.py` but
 * trimmed to what is needed at runtime (no docstring HTML conversion, no
 * disk I/O, no TypeScript generation).
 */

export const TOOLBOX_PYTHON_HELPERS = `
import sys as _pv_sys
import importlib as _pv_importlib
import inspect as _pv_inspect
import types as _pv_types
import json as _pv_json

_PV_INLINE_PREFIX = "pathview_inline_"

async def _pv_install_spec(spec):
    """Install a package via micropip. Spec can be 'name', 'name==1.2', or a wheel URL."""
    import micropip
    await micropip.install(spec, keep_going=True)
    return {"ok": True, "spec": spec}

def _pv_load_inline(module_name, code):
    """Exec a single-file Python module string into sys.modules under module_name."""
    if not module_name.startswith(_PV_INLINE_PREFIX):
        module_name = _PV_INLINE_PREFIX + module_name
    mod = _pv_types.ModuleType(module_name)
    mod.__file__ = "<inline:" + module_name + ">"
    try:
        exec(compile(code, mod.__file__, "exec"), mod.__dict__)
    except Exception as e:
        return {"ok": False, "error": str(e), "module": module_name}
    _pv_sys.modules[module_name] = mod
    return {"ok": True, "module": module_name}

def _pv_drop_module(import_path):
    """Drop a module (and its submodules) from sys.modules. Returns dropped names."""
    dropped = []
    prefix = import_path + "."
    for name in list(_pv_sys.modules.keys()):
        if name == import_path or name.startswith(prefix):
            try:
                del _pv_sys.modules[name]
                dropped.append(name)
            except KeyError:
                pass
    return dropped

def _pv_default_repr(value):
    """Best-effort JSON-friendly repr of a default parameter value."""
    if value is _pv_inspect.Parameter.empty:
        return None
    try:
        _pv_json.dumps(value)
        return value
    except (TypeError, ValueError):
        try:
            return repr(value)
        except Exception:
            return None

def _pv_infer_type(value):
    """Infer a coarse parameter type from a default value."""
    if value is None or value is _pv_inspect.Parameter.empty:
        return "any"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "number"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (list, tuple)):
        return "array"
    if isinstance(value, dict):
        return "object"
    if callable(value):
        return "function"
    return "any"

def _pv_extract_params(cls):
    """Extract __init__ parameters via inspect.signature."""
    params = []
    try:
        sig = _pv_inspect.signature(cls.__init__)
    except (TypeError, ValueError):
        return params
    for pname, p in sig.parameters.items():
        if pname == "self":
            continue
        if p.kind in (
            _pv_inspect.Parameter.VAR_POSITIONAL,
            _pv_inspect.Parameter.VAR_KEYWORD,
        ):
            continue
        default = _pv_default_repr(p.default)
        params.append({
            "name": pname,
            "default": default,
            "type": _pv_infer_type(p.default),
        })
    return params

def _pv_extract_block(cls):
    """Pull metadata for a single block class."""
    info = None
    info_fn = getattr(cls, "info", None)
    if callable(info_fn):
        try:
            info = info_fn()
        except Exception:
            info = None

    if info is not None:
        params = []
        for pname, meta in (info.get("parameters") or {}).items():
            default = meta.get("default") if isinstance(meta, dict) else None
            params.append({
                "name": pname,
                "default": _pv_default_repr(default),
                "type": _pv_infer_type(default),
            })
        return {
            "className": cls.__name__,
            "description": (info.get("description") or "").strip(),
            "inputs": info.get("input_port_labels"),
            "outputs": info.get("output_port_labels"),
            "params": params,
        }

    return {
        "className": cls.__name__,
        "description": (cls.__doc__ or "").strip(),
        "inputs": getattr(cls, "input_port_labels", None),
        "outputs": getattr(cls, "output_port_labels", None),
        "params": _pv_extract_params(cls),
    }

def _pv_is_block(cls):
    """Check if a class is a pathsim Block subclass (best-effort, no hard import)."""
    if not _pv_inspect.isclass(cls):
        return False
    for base in cls.__mro__[1:]:
        if base.__name__ == "Block" and base.__module__.startswith("pathsim"):
            return True
    return False

def _pv_is_event(cls):
    """Heuristic for event-like classes."""
    if not _pv_inspect.isclass(cls):
        return False
    name = cls.__name__
    if name.startswith("_"):
        return False
    for base in cls.__mro__[1:]:
        if base.__name__.endswith("Event") and "pathsim" in base.__module__:
            return True
    # Fallback: classname ends in Event
    return name.endswith("Event")

def pathview_introspect_blocks(import_path):
    """Import the module and return all Block subclasses with metadata."""
    try:
        mod = _pv_importlib.import_module(import_path)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    blocks = []
    for name in dir(mod):
        if name.startswith("_"):
            continue
        obj = getattr(mod, name)
        if not _pv_is_block(obj):
            continue
        # Skip classes re-exported from elsewhere
        if obj.__module__ != mod.__name__ and not obj.__module__.startswith(mod.__name__ + "."):
            continue
        try:
            blocks.append(_pv_extract_block(obj))
        except Exception as e:
            blocks.append({"className": name, "error": str(e)})
    return {"ok": True, "blocks": blocks}

def pathview_introspect_events(import_path):
    """Import the events submodule and list event classes with their __init__ params."""
    try:
        mod = _pv_importlib.import_module(import_path)
    except Exception as e:
        return {"ok": False, "error": str(e)}
    events = []
    for name in dir(mod):
        if name.startswith("_"):
            continue
        obj = getattr(mod, name)
        if not _pv_is_event(obj):
            continue
        if obj.__module__ != mod.__name__ and not obj.__module__.startswith(mod.__name__ + "."):
            continue
        events.append({
            "className": obj.__name__,
            "description": (obj.__doc__ or "").strip(),
            "params": _pv_extract_params(obj),
        })
    return {"ok": True, "events": events}

def pathview_uninstall(import_path):
    """Drop a module + submodules from sys.modules. micropip has no real uninstall."""
    dropped = _pv_drop_module(import_path)
    return {"ok": True, "dropped": dropped}

_pv_helpers_loaded = True
`;

/** Sentinel expression used to check whether helpers are already loaded in the REPL. */
export const TOOLBOX_HELPERS_SENTINEL = `'_pv_helpers_loaded' in dir()`;
