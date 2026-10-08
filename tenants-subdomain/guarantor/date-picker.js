        const dpMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        let dpYear, dpMonth, dpTargetInput, dpSelectedDate;

        function openDatePicker(inputId) {
            if(document.getElementById(inputId)?.matches(':disabled'))return;
            dpTargetInput = document.getElementById(inputId);
            const existing = parseDDMMYYYY(dpTargetInput.value);
            const now = new Date();

            if (existing) {
                dpYear = existing.getFullYear();
                dpMonth = existing.getMonth();
                dpSelectedDate = existing;
            } else {
                dpYear = now.getFullYear();
                dpMonth = now.getMonth();
                dpSelectedDate = null;
            }

            const picker = document.getElementById('datePicker');
            document.getElementById('monthSelector').classList.remove('open');
            document.getElementById('yearSelector').classList.remove('open');
            showDpContent();
            picker.style.removeProperty('top');picker.style.removeProperty('left');picker.style.removeProperty('width');
            document.getElementById('dpOverlay').classList.add('open');

            if (window.innerWidth > 768) {
                const rect = dpTargetInput.getBoundingClientRect();
                const pickerHeight = 380;
                const spaceBelow = window.innerHeight - rect.bottom;
                picker.style.left = Math.max(8,Math.min(rect.left,window.innerWidth-Math.min(320,rect.width)-8)) + 'px';
                picker.style.width = Math.min(320, rect.width) + 'px';
                if (spaceBelow >= pickerHeight) {
                    picker.style.top = (rect.bottom + 5) + 'px';
                } else {
                    picker.style.top = Math.max(8,rect.top - pickerHeight - 5) + 'px';
                }
            }

            renderCalendar();
            picker.classList.add('open');
        }

        document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDatePicker();});
        function closeDatePicker() {
            document.getElementById('datePicker').classList.remove('open');
            document.getElementById('dpOverlay').classList.remove('open');
            document.getElementById('monthSelector').classList.remove('open');
            document.getElementById('yearSelector').classList.remove('open');
        }

        function renderCalendar() {
            document.getElementById('dpMonthBtn').textContent = dpMonths[dpMonth];
            document.getElementById('dpYearBtn').textContent = dpYear;

            const firstDay = new Date(dpYear, dpMonth, 1);
            const lastDay = new Date(dpYear, dpMonth + 1, 0);
            const startDay = (firstDay.getDay() + 6) % 7;
            const daysInMonth = lastDay.getDate();
            const prevLastDay = new Date(dpYear, dpMonth, 0).getDate();

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let html = '';
            for (let i = startDay - 1; i >= 0; i--) {
                const day = prevLastDay - i;
                html += `<button type="button" class="dp-day other-month" onclick="dpSelectDay(${dpYear},${dpMonth - 1},${day})">${day}</button>`;
            }
            for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(dpYear, dpMonth, d);
                const isToday = date.getTime() === today.getTime();
                const isSelected = dpSelectedDate && date.getTime() === dpSelectedDate.getTime();
                let cls = 'dp-day';
                if (isToday) cls += ' today';
                if (isSelected) cls += ' selected';
                html += `<button type="button" class="${cls}" onclick="dpSelectDay(${dpYear},${dpMonth},${d})">${d}</button>`;
            }
            const totalCells = startDay + daysInMonth;
            const remaining = (7 - (totalCells % 7)) % 7;
            for (let d = 1; d <= remaining; d++) {
                html += `<button type="button" class="dp-day other-month" onclick="dpSelectDay(${dpYear},${dpMonth + 1},${d})">${d}</button>`;
            }
            document.getElementById('dpDays').innerHTML = html;
        }

        function dpSelectDay(year, month, day) {
            const date = new Date(year, month, day);
            dpSelectedDate = date;
            dpYear = date.getFullYear();
            dpMonth = date.getMonth();
            const dd = String(date.getDate()).padStart(2, '0');
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            dpTargetInput.value = `${dd}/${mm}/${yyyy}`;
            dpTargetInput.dispatchEvent(new Event('input', { bubbles: true }));
            closeDatePicker();
        }

        function dpPrevMonth() {
            dpMonth--;
            if (dpMonth < 0) { dpMonth = 11; dpYear--; }
            renderCalendar();
        }

        function dpNextMonth() {
            dpMonth++;
            if (dpMonth > 11) { dpMonth = 0; dpYear++; }
            renderCalendar();
        }

        function dpSelectToday() {
            const now = new Date();
            dpSelectDay(now.getFullYear(), now.getMonth(), now.getDate());
        }

        function dpClear() {
            dpTargetInput.value = '';
            dpSelectedDate = null;
            closeDatePicker();
        }

        function hideDpContent() {
            document.getElementById('dpDays').style.display = 'none';
            document.querySelector('#datePicker .dp-footer').style.display = 'none';
            document.querySelector('#datePicker .dp-weekdays').style.display = 'none';
        }

        function showDpContent() {
            document.getElementById('dpDays').style.display = '';
            document.querySelector('#datePicker .dp-footer').style.display = '';
            document.querySelector('#datePicker .dp-weekdays').style.display = '';
        }

        function showMonthSelector() {
            const grid = document.getElementById('monthGrid');
            grid.innerHTML = dpMonths.map((m, i) =>
                `<button type="button" class="dp-selector-item${i === dpMonth ? ' active' : ''}" onclick="selectMonth(${i})">${m.substring(0, 3)}</button>`
            ).join('');
            document.getElementById('monthSelector').classList.add('open');
            document.getElementById('yearSelector').classList.remove('open');
            hideDpContent();
        }

        function selectMonth(m) {
            dpMonth = m;
            document.getElementById('monthSelector').classList.remove('open');
            showDpContent();
            renderCalendar();
        }

        function showYearSelector() {
            const grid = document.getElementById('yearGrid');
            const currentYear = new Date().getFullYear();
            let html = '';
            for (let y = currentYear; y >= 1920; y--) {
                html += `<button type="button" class="dp-selector-item${y === dpYear ? ' active' : ''}" onclick="selectYear(${y})">${y}</button>`;
            }
            grid.innerHTML = html;
            document.getElementById('yearSelector').classList.add('open');
            document.getElementById('monthSelector').classList.remove('open');
            hideDpContent();
            setTimeout(() => {
                const active = grid.querySelector('.active');
                if (active) grid.scrollTop = active.offsetTop-grid.offsetTop-grid.clientHeight/2;
            }, 50);
        }

        function selectYear(y) {
            dpYear = y;
            document.getElementById('yearSelector').classList.remove('open');
            showDpContent();
            renderCalendar();
        }

        function formatDateInput(input) {
            let value = input.value.replace(/[^\d]/g, '');
            if (value.length > 8) value = value.substring(0, 8);
            if (value.length >= 5) {
                value = value.substring(0, 2) + '/' + value.substring(2, 4) + '/' + value.substring(4);
            } else if (value.length >= 3) {
                value = value.substring(0, 2) + '/' + value.substring(2);
            }
            input.value = value;
        }

        function parseDDMMYYYY(dateStr) {
            if (!dateStr) return null;
            const parts = dateStr.split('/');
            if (parts.length !== 3) return null;
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
            return new Date(year, month, day);
        }

        function isoToDDMMYYYY(isoStr) {
            if (!isoStr) return '';
            const match = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (match) return match[3] + '/' + match[2] + '/' + match[1];
            return isoStr;
        }


document.addEventListener('click',e=>{if(!e.target.closest('.date-picker-dropdown')&&!e.target.closest('.date-picker-wrapper'))closeDatePicker();});
