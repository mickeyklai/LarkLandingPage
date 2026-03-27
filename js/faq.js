(function () {
    var faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(function (item) {
        var question = item.querySelector('.faq-question');
        if (!question) return;

        question.addEventListener('click', function () {
            var isOpen = item.classList.contains('open');

            /* Close all items */
            faqItems.forEach(function (fi) {
                fi.classList.remove('open');
                var q = fi.querySelector('.faq-question');
                if (q) q.setAttribute('aria-expanded', 'false');
            });

            /* Toggle the clicked item */
            if (!isOpen) {
                item.classList.add('open');
                question.setAttribute('aria-expanded', 'true');
            }
        });
    });
})();
