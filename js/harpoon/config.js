local Extensions = require("harpoon.extensions")
local Logger = require("harpoon.logger")
local Path = require("plenary.path")
local function normalize_path(buf_name, root)
    return Path:new(buf_name):make_relative(root)
end

local M = {}
local DEFAULT_LIST = "__harpoon_files"
M.DEFAULT_LIST = DEFAULT_LIST


function M.get_config(config, name)
    return vim.tbl_extend("force", {}, config.default, config[name] or {})
end

function M.get_default_config()
    return {

        settings = {
            save_on_toggle = false,
            sync_on_ui_close = false,
            key = function()
                return vim.loop.cwd()
            end,
        },

        default = {

            --- select_with_nill allows for a list to call select even if the provided item is nil
            select_with_nil = false,

            encode = function(obj)
                return vim.json.encode(obj)
            end,

            decode = function(str)
                return vim.json.decode(str)
            end,

            display = function(list_item)
                return list_item.value
            end,

            --- the select function is called when a user selects an item from
            --- the corresponding list and can be nil if select_with_nil is true
            select = function(list_item, list, options)
                Logger:log(
                    "config_default#select",
                    list_item,
                    list.name,
                    options
                )
                options = options or {}
                if list_item == nil then
                    return
                end

                local bufnr = vim.fn.bufnr(list_item.value)
                local set_position = false
                if bufnr == -1 then
                    set_position = true
                    bufnr = vim.fn.bufnr(list_item.value, true)
                end
                if not vim.api.nvim_buf_is_loaded(bufnr) then
                    vim.fn.bufload(bufnr)
                    vim.api.nvim_set_option_value("buflisted", true, {
                        buf = bufnr,
                    })
                end

                if options.vsplit then
                    vim.cmd("vsplit")
                elseif options.split then
                    vim.cmd("split")
                elseif options.tabedit then
                    vim.cmd("tabedit")
                end

                vim.api.nvim_set_current_buf(bufnr)

                if set_position then
                    vim.api.nvim_win_set_cursor(0, {
                        list_item.context.row or 1,
                        list_item.context.col or 0,
                    })
                end

                Extensions.extensions:emit(Extensions.event_names.NAVIGATE, {
                    buffer = bufnr,
                })
            end,

            equals = function(list_item_a, list_item_b)
                return list_item_a.value == list_item_b.value
            end,

            get_root_dir = function()
                return vim.loop.cwd()
            end,

            create_list_item = function(config, name)
                name = name
                    -- TODO: should we do path normalization???
                    -- i know i have seen sometimes it becoming an absolute
                    -- path, if that is the case we can use the context to
                    -- store the bufname and then have value be the normalized
                    -- value
                    or normalize_path(
                        vim.api.nvim_buf_get_name(
                            vim.api.nvim_get_current_buf()
                        ),
                        config.get_root_dir()
                    )

                Logger:log("config_default#create_list_item", name)

                local bufnr = vim.fn.bufnr(name, false)

                local pos = { 1, 0 }
                if bufnr ~= -1 then
                    pos = vim.api.nvim_win_get_cursor(0)
                end

                return {
                    value = name,
                    context = {
                        row = pos[1],
                        col = pos[2],
                    },
                }
            end,

            BufLeave = function(arg, list)
                local bufnr = arg.buf
                local bufname = vim.api.nvim_buf_get_name(bufnr)
                local item = list:get_by_display(bufname)

                if item then
                    local pos = vim.api.nvim_win_get_cursor(0)

                    Logger:log(
                        "config_default#BufLeave updating position",
                        bufnr,
                        bufname,
                        item,
                        "to position",
                        pos
                    )

                    item.context.row = pos[1]
                    item.context.col = pos[2]
                end
            end,

            autocmds = { "BufLeave" },
        },
    }
end

function M.merge_config(partial_config, latest_config)
    partial_config = partial_config or {}
    local config = latest_config or M.get_default_config()
    for k, v in pairs(partial_config) do
        if k == "settings" then
            config.settings = vim.tbl_extend("force", config.settings, v)
        elseif k == "default" then
            config.default = vim.tbl_extend("force", config.default, v)
        else
            config[k] = vim.tbl_extend("force", config[k] or {}, v)
        end
    end
    return config
end

return M