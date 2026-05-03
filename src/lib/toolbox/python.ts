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
import re as _pv_re

_PV_INLINE_PREFIX = "pathview_inline_"

# Lazy/cached docutils probe — only loaded if available
_pv_publish_parts = None
_pv_docutils_checked = False

def _pv_rst_to_html(rst):
    """Convert RST docstring to HTML using docutils if installed."""
    global _pv_publish_parts, _pv_docutils_checked
    if not rst:
        return ""
    if not _pv_docutils_checked:
        _pv_docutils_checked = True
        try:
            from docutils.core import publish_parts
            _pv_publish_parts = publish_parts
        except Exception:
            _pv_publish_parts = None
    if _pv_publish_parts is None:
        return ""
    try:
        cleaned = _pv_inspect.cleandoc(rst)
        parts = _pv_publish_parts(
            cleaned,
            writer_name="html",
            settings_overrides={
                "report_level": 5,
                "halt_level": 5,
                "initial_header_level": 3,
                "math_output": "MathJax",
            },
        )
        return parts.get("body") or ""
    except Exception:
        return ""

def _pv_first_line(docstring):
    """First sentence of the docstring (used as the short description)."""
    if not docstring:
        return ""
    for line in docstring.strip().split("\n"):
        s = line.strip()
        if not s:
            continue
        if ". " in s:
            return s.split(". ")[0] + "."
        return s
    return ""

def _pv_param_desc(docstring, param_name):
    """Extract a ':param name:' description from an RST docstring."""
    if not docstring:
        return ""
    pattern = rf"{_pv_re.escape(param_name)}\s*:\s*[^\n]*\n\s+(.+?)(?=\n\s*\w+\s*:|\n\n|$)"
    m = _pv_re.search(pattern, docstring, _pv_re.DOTALL)
    if m:
        return _pv_re.sub(r"\s+", " ", m.group(1).strip())
    return ""

def _pv_already_installed(import_path):
    """Return True if the given module path is already importable."""
    if not import_path:
        return False
    try:
        _pv_importlib.import_module(import_path)
        return True
    except Exception:
        return False

async def _pv_install_micropip(spec):
    """Pyodide-side install via micropip (top-level await)."""
    import micropip
    await micropip.install(spec, keep_going=True)
    return {"ok": True, "spec": spec, "via": "micropip"}

def _pv_install_pip(spec):
    """CPython-side install via subprocess pip (Flask backend)."""
    import subprocess as _pv_subprocess
    import sys as _pv_runtime_sys
    res = _pv_subprocess.run(
        [_pv_runtime_sys.executable, "-m", "pip", "install", spec],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        raise RuntimeError("pip install failed:\\n" + (res.stderr or res.stdout))
    return {"ok": True, "spec": spec, "via": "pip"}

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

def _pv_format_default(value):
    """Format a parameter default as a TypeScript-compatible source string,
    matching scripts/extract.py format_default()."""
    if value is None or value is _pv_inspect.Parameter.empty:
        return None
    if callable(value) and not isinstance(value, type):
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return _pv_json.dumps(value)
    if isinstance(value, (list, tuple)):
        try:
            return _pv_json.dumps(list(value))
        except Exception:
            return repr(list(value))
    if isinstance(value, type):
        return _pv_json.dumps(value.__name__)
    try:
        return repr(value)
    except Exception:
        return None

def _pv_infer_type(value, name=""):
    """Infer ParamType, mirroring scripts/extract.py infer_param_type()."""
    if name and (name.startswith("func_") or name.startswith("func")):
        return "callable"
    if callable(value) and not isinstance(value, type):
        return "callable"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (list, tuple)):
        return "array"
    return "any"

def _pv_extract_params(cls, docstring):
    """Extract __init__ parameters via inspect.signature, with RST descriptions."""
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
        params.append({
            "name": pname,
            "default": _pv_format_default(p.default),
            "type": _pv_infer_type(p.default, pname),
            "description": _pv_param_desc(docstring, pname),
        })
    return params

def _pv_extract_block(cls):
    """Pull metadata for a single block class."""
    raw_doc = cls.__doc__ or ""

    info = None
    info_fn = getattr(cls, "info", None)
    if callable(info_fn):
        try:
            info = info_fn()
        except Exception:
            info = None

    if info is not None:
        # Prefer info["description"] but fall back to __doc__ for the RST
        # source so we can parse :param: and HTML the same way as build-time.
        rst = (info.get("description") or raw_doc).strip()
        params = []
        for pname, meta in (info.get("parameters") or {}).items():
            default = meta.get("default") if isinstance(meta, dict) else None
            params.append({
                "name": pname,
                "default": _pv_format_default(default),
                "type": _pv_infer_type(default, pname),
                "description": _pv_param_desc(rst, pname),
            })
        return {
            "className": cls.__name__,
            "description": _pv_first_line(rst),
            "docstringHtml": _pv_rst_to_html(rst),
            "inputs": info.get("input_port_labels"),
            "outputs": info.get("output_port_labels"),
            "params": params,
        }

    return {
        "className": cls.__name__,
        "description": _pv_first_line(raw_doc),
        "docstringHtml": _pv_rst_to_html(raw_doc),
        "inputs": getattr(cls, "input_port_labels", None),
        "outputs": getattr(cls, "output_port_labels", None),
        "params": _pv_extract_params(cls, raw_doc),
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
        raw_doc = obj.__doc__ or ""
        events.append({
            "className": obj.__name__,
            "description": _pv_first_line(raw_doc),
            "docstringHtml": _pv_rst_to_html(raw_doc),
            "params": _pv_extract_params(obj, raw_doc),
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
